import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {} from 'multer';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { UpdateHistoricalPurchaseDto } from './dto/update-historical-purchase.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { UpdateReceptionDto } from './dto/update-reception.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('purchases')
@UseGuards(AuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  create(@Body() dto: CreatePurchaseDto, @Req() req: any) {
    if (req.user?.role === Role.BAREQUERO_OPERATOR && dto.type === 'ACCOUNTING') {
      throw new ForbiddenException(
        'Acceso denegado: el operador de barequeros solo tiene permitido registrar recepciones de material.',
      );
    }
    return this.purchasesService.create(dto, req.user);
  }

  @Get('next-consecutive')
  getNextConsecutive(@CurrentCompanyId() companyId: string) {
    return this.purchasesService.getNextConsecutive(companyId);
  }

  @Get()
  findAll(
    @CurrentCompanyId() companyId: string,
    @Req() req: any,
    @Query('status') status?: 'unassigned' | 'assigned',
    @Query('type') type?: 'ACCOUNTING' | 'FORMAL',
  ) {
    const effectiveType = req.user?.role === Role.BAREQUERO_OPERATOR ? 'FORMAL' : type;
    return this.purchasesService.findAll(companyId, status, effectiveType);
  }

  @Get(':id/receipt-excel')
  async downloadReceiptExcel(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const purchase = await this.purchasesService.findOne(companyId, id);
    if (req.user?.role === Role.BAREQUERO_OPERATOR && purchase.type === 'ACCOUNTING') {
      throw new ForbiddenException(
        'Acceso restringido: no tiene permisos para descargar comprobantes de compras generales.',
      );
    }
    const { buffer, filename } = await this.purchasesService.generateReceiptExcel(companyId, id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }

  @Post('vendor-photo')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  @UseInterceptors(FileInterceptor('file'))
  uploadVendorPhoto(
    @CurrentCompanyId() companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.purchasesService.uploadVendorPhoto(companyId, file);
  }

  @Post(':id/signed-receipt')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  @UseInterceptors(FileInterceptor('file'))
  uploadSignedReceipt(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.purchasesService.uploadSignedReceipt(companyId, id, file);
  }

  @Public()
  @Get([':id/signed-receipt/file', ':id/signed-receipt/file/{*key}'])
  async getSignedReceiptFile(@Param('id') id: string, @Res() res: Response) {
    const { stream, mimeType, length, filename } =
      await this.purchasesService.getSignedReceiptStream(id);
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    if (length) {
      res.setHeader('Content-Length', length);
    }
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    stream.pipe(res);
  }

  @Delete(':id/signed-receipt')
  @Roles(Role.ADMIN)
  removeSignedReceipt(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.purchasesService.removeSignedReceipt(companyId, id);
  }

  @Get(':id')
  async findOne(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const purchase = await this.purchasesService.findOne(companyId, id);
    if (req.user?.role === Role.BAREQUERO_OPERATOR && purchase.type === 'ACCOUNTING') {
      throw new ForbiddenException(
        'Acceso restringido: el operador de barequeros solo tiene permisos para consultar recepciones de material.',
      );
    }
    return purchase;
  }

  @Patch(':id/material')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  updateMaterial(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
    @Req() req: any,
  ) {
    const isSuperAdmin = req.user?.role === Role.SUPER_ADMIN || req.user?.isImpersonating === true;
    if (!isSuperAdmin) {
      throw new ForbiddenException(
        'Solo el Super Administrador tiene autorización para cambiar el material de una compra.',
      );
    }
    return this.purchasesService.updateMaterial(companyId, id, dto.material);
  }

  @Patch(':id/historical')
  @Roles(Role.ADMIN)
  updateHistorical(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateHistoricalPurchaseDto,
  ) {
    return this.purchasesService.updateHistorical(companyId, id, dto);
  }

  @Patch(':id/reception')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateReception(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReceptionDto,
  ) {
    return this.purchasesService.updateReception(companyId, id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
  ) {
    return this.purchasesService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.purchasesService.remove(companyId, id);
  }
}
