import {
  Body,
  Controller,
  Delete,
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
    return this.purchasesService.create(dto, req.user);
  }

  @Get('next-consecutive')
  getNextConsecutive(@CurrentCompanyId() companyId: string) {
    return this.purchasesService.getNextConsecutive(companyId);
  }

  @Get()
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('status') status?: 'unassigned' | 'assigned',
    @Query('type') type?: 'ACCOUNTING' | 'FORMAL',
  ) {
    return this.purchasesService.findAll(companyId, status, type);
  }

  @Get(':id/receipt-excel')
  async downloadReceiptExcel(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
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
  uploadVendorPhoto(@UploadedFile() file: Express.Multer.File) {
    return this.purchasesService.uploadVendorPhoto(file);
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
  findOne(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.purchasesService.findOne(companyId, id);
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
