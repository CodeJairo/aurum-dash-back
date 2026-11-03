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
import type { Response, Request } from 'express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseCategory, ExpenseStatus, PaymentAccount, Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('expenses')
@UseGuards(AuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(
    @CurrentCompanyId() companyId: string,
    @Body() dto: CreateExpenseDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id;
    return this.expensesService.create(companyId, dto, userId);
  }

  @Post('upload-receipt')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadReceipt(
    @CurrentCompanyId() companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.expensesService.uploadReceipt(companyId, file);
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
    const { stream, mimeType, length } = await this.expensesService.getReceiptStream(key);
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

  @Public()
  @Get(':id/receipt/file')
  async getReceiptFileById(@Param('id') id: string, @Res() res: Response) {
    const expense = await this.expensesService.findOneByIdOnly(id);
    if (!expense.receiptKey) {
      return res.status(404).send('Comprobante no encontrado.');
    }
    const { stream, mimeType, length } = await this.expensesService.getReceiptStream(expense.receiptKey);
    const filename = expense.receiptKey.split('/').pop() || 'comprobante';
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    if (length) {
      res.setHeader('Content-Length', length);
    }
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return stream.pipe(res);
  }

  @Get()
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('batchId') batchId?: string,
    @Query('category') category?: ExpenseCategory,
    @Query('status') status?: ExpenseStatus,
    @Query('paymentAccount') paymentAccount?: PaymentAccount,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expensesService.findAll(companyId, {
      batchId,
      category,
      status,
      paymentAccount,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  findOne(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.expensesService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
  ) {
    return this.expensesService.remove(companyId, id);
  }
}
