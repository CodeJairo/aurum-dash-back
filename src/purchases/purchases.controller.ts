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
  getNextConsecutive() {
    return this.purchasesService.getNextConsecutive();
  }

  @Get()
  findAll(
    @Query('status') status?: 'unassigned' | 'assigned',
    @Query('type') type?: 'ACCOUNTING' | 'FORMAL',
  ) {
    return this.purchasesService.findAll(status, type);
  }

  @Get(':id/receipt-excel')
  async downloadReceiptExcel(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.purchasesService.generateReceiptExcel(id);
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

  @Post(':id/signed-receipt')
  @Roles(Role.ADMIN, Role.BAREQUERO_OPERATOR)
  @UseInterceptors(FileInterceptor('file'))
  uploadSignedReceipt(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.purchasesService.uploadSignedReceipt(id, file);
  }

  @Get(':id/signed-receipt/file')
  async getSignedReceiptFile(@Param('id') id: string, @Res() res: Response) {
    const { stream, mimeType, length, filename } =
      await this.purchasesService.getSignedReceiptStream(id);
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    if (length) {
      res.setHeader('Content-Length', length);
    }
    // Inline para que el navegador pueda previsualizar PDFs o imágenes si lo desea
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    stream.pipe(res);
  }

  @Delete(':id/signed-receipt')
  @Roles(Role.ADMIN)
  removeSignedReceipt(@Param('id') id: string) {
    return this.purchasesService.removeSignedReceipt(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchasesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.purchasesService.remove(id);
  }
}
