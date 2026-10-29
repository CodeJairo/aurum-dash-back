import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import 'multer';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export interface UploadResult {
  fileKey: string;
  fileUrl: string;
  sizeBytes: number;
  mimeType: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucketName: string | null = null;
  private readonly localStorageDir: string;

  constructor() {
    this.localStorageDir = path.resolve(process.cwd(), 'uploads', 'documents');
    if (!fs.existsSync(this.localStorageDir)) {
      fs.mkdirSync(this.localStorageDir, { recursive: true });
    }

    const bucket = process.env.S3_BUCKET || process.env.R2_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
    const endpoint = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT;
    const region = process.env.S3_REGION || 'us-east-1';
    const forcePathStyle =
      process.env.S3_FORCE_PATH_STYLE !== undefined
        ? process.env.S3_FORCE_PATH_STYLE === 'true'
        : !!endpoint;

    if (bucket && accessKeyId && secretAccessKey) {
      this.bucketName = bucket;
      this.s3Client = new S3Client({
        region,
        endpoint: endpoint || undefined,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle,
      });
      this.logger.log(`Almacenamiento S3 inicializado (Bucket: ${bucket}, Endpoint: ${endpoint || 'AWS S3 Default'})`);
    } else {
      this.logger.warn(
        'Variables S3_BUCKET / S3_ACCESS_KEY_ID no encontradas. Utilizando almacenamiento local en disco (/uploads/documents)',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  /**
   * Verifica la existencia del bucket principal y lo crea automáticamente si no existe.
   */
  async ensureBucketExists(): Promise<void> {
    if (!this.s3Client || !this.bucketName) {
      return;
    }

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      this.logger.log(`Bucket S3 "${this.bucketName}" verificado correctamente.`);
    } catch (error: any) {
      // 404 / NotFound indica que el bucket no existe
      const isNotFound =
        error?.name === 'NotFound' ||
        error?.$metadata?.httpStatusCode === 404 ||
        error?.code === 'NoSuchBucket';

      if (isNotFound) {
        this.logger.warn(`El bucket "${this.bucketName}" no existe. Creándolo automáticamente...`);
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
          this.logger.log(`Bucket S3 "${this.bucketName}" creado exitosamente.`);
        } catch (createErr: any) {
          this.logger.error(`Error al crear el bucket "${this.bucketName}":`, createErr?.message || createErr);
        }
      } else {
        this.logger.warn(
          `No se pudo verificar el bucket "${this.bucketName}" (podría ser creado más tarde o el servicio S3/Silo aún está iniciando): ${error?.message || error}`,
        );
      }
    }
  }

  /**
   * Sube un archivo a S3 o al almacenamiento local si S3 no está configurado.
   * @param file Archivo Multer
   * @param prefix Prefijo o carpeta dentro del bucket (ej: 'barequeros', 'purchases')
   * @param apiBasePath Ruta base para la descarga autenticada si no hay URL pública
   */
  async uploadFile(
    file: Express.Multer.File,
    prefix: string = 'documents',
    apiBasePath: string = '/api/formalizers/documents/file',
  ): Promise<UploadResult> {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const fileKey = `${prefix}/${uniqueSuffix}${ext}`;

    if (this.s3Client && this.bucketName) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      const publicBase = process.env.S3_PUBLIC_URL || '';
      const fileUrl = publicBase
        ? `${publicBase}/${fileKey}`
        : `${apiBasePath}/${encodeURIComponent(fileKey)}`;

      return {
        fileKey,
        fileUrl,
        sizeBytes: file.size,
        mimeType: file.mimetype,
      };
    }

    // Almacenamiento local fallback
    const targetPath = path.join(this.localStorageDir, path.basename(fileKey));
    await fs.promises.writeFile(targetPath, file.buffer);

    return {
      fileKey,
      fileUrl: `${apiBasePath}/${encodeURIComponent(path.basename(fileKey))}`,
      sizeBytes: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Obtiene un flujo de lectura para streaming de un archivo desde S3 o disco local.
   */
  async getFileStream(fileKey: string): Promise<{ stream: Readable; mimeType?: string; length?: number }> {
    if (this.s3Client && this.bucketName) {
      const resp = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
        }),
      );
      return {
        stream: resp.Body as Readable,
        mimeType: resp.ContentType,
        length: resp.ContentLength,
      };
    }

    // Local file fallback
    const localBasename = path.basename(fileKey);
    const targetPath = path.join(this.localStorageDir, localBasename);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Archivo no encontrado: ${localBasename}`);
    }

    const stat = await fs.promises.stat(targetPath);
    const stream = fs.createReadStream(targetPath);
    return {
      stream,
      length: stat.size,
    };
  }

  /**
   * Elimina un archivo de S3 o del disco local.
   */
  async deleteFile(fileKey: string): Promise<void> {
    if (this.s3Client && this.bucketName) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: fileKey,
          }),
        );
      } catch (err) {
        this.logger.error(`Error al borrar archivo en S3: ${fileKey}`, err);
      }
      return;
    }

    const localBasename = path.basename(fileKey);
    const targetPath = path.join(this.localStorageDir, localBasename);
    if (fs.existsSync(targetPath)) {
      try {
        await fs.promises.unlink(targetPath);
      } catch (err) {
        this.logger.error(`Error al borrar archivo local: ${localBasename}`, err);
      }
    }
  }
}
