import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { CapitalService } from './capital.service';
import { CreateCapitalMovementDto, TransferCapitalDto } from './dto/create-capital-movement.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('capital')
@UseGuards(AuthGuard, RolesGuard)
export class CapitalController {
  constructor(private readonly capitalService: CapitalService) {}

  @Get('balance')
  getBalance(@CurrentCompanyId() companyId: string) {
    return this.capitalService.getBalance(companyId);
  }

  @Get('movements')
  getMovements(
    @CurrentCompanyId() companyId: string,
    @Query('limit') limit?: string,
  ) {
    const num = limit ? parseInt(limit, 10) : 100;
    return this.capitalService.getMovements(companyId, num);
  }

  @Post('upload-receipt')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadReceipt(
    @CurrentCompanyId() companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.capitalService.uploadReceipt(companyId, file);
  }

  @Public()
  @Get(['receipt/file', 'receipt/file/{*key}'])
  async getReceiptFileByKey(
    @Req() req: any,
    @Query('key') queryKey: string,
    @Res() res: Response,
  ) {
    let key = queryKey;
    if (!key && req.params?.key) {
      key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
    }
    if (!key && req.originalUrl?.includes('/receipt/file/')) {
      const part = req.originalUrl.split('/receipt/file/')[1]?.split('?')[0];
      if (part) {
        key = decodeURIComponent(part);
      }
    }
    if (key) {
      key = key.replace(/^\/+/, '');
    }
    if (!key) {
      return res.status(404).send('Comprobante no especificado.');
    }
    const { stream, mimeType, length } = await this.capitalService.getReceiptStream(key);
    const filename = key ? key.split('/').pop() || 'comprobante' : 'comprobante';
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    if (length) {
      res.setHeader('Content-Length', length);
    }
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return stream.pipe(res);
  }

  @Post('manual-movement')
  @Roles(Role.ADMIN)
  createManualMovement(
    @CurrentCompanyId() companyId: string,
    @Body() dto: CreateCapitalMovementDto,
  ) {
    return this.capitalService.createManualMovement(companyId, dto);
  }

  @Post('transfer')
  @Roles(Role.ADMIN)
  transferInternal(
    @CurrentCompanyId() companyId: string,
    @Body() dto: TransferCapitalDto,
  ) {
    return this.capitalService.transferInternal(companyId, dto);
  }
}
