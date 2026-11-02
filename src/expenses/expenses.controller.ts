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

@Controller('expenses')
@UseGuards(AuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateExpenseDto, @Req() req: Request) {
    const userId = (req as any).user?.id;
    return this.expensesService.create(dto, userId);
  }

  @Post('upload-receipt')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadReceipt(@UploadedFile() file: Express.Multer.File) {
    return this.expensesService.uploadReceipt(file);
  }

  @Public()
  @Get('receipt/file')
  async getReceiptFileByKey(@Query('key') key: string, @Res() res: Response) {
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
    const expense = await this.expensesService.findOne(id);
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
    @Query('batchId') batchId?: string,
    @Query('category') category?: ExpenseCategory,
    @Query('status') status?: ExpenseStatus,
    @Query('paymentAccount') paymentAccount?: PaymentAccount,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expensesService.findAll({
      batchId,
      category,
      status,
      paymentAccount,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.expensesService.remove(id);
  }
}
