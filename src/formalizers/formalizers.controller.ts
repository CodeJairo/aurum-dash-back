import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { FormalizersService } from './formalizers.service';
import { CreateFormalizerDto } from './dto/create-formalizer.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('formalizers')
@UseGuards(AuthGuard)
export class FormalizersController {
  constructor(private readonly formalizersService: FormalizersService) {}

  @Get()
  findAll(@Query('status') status?: 'AVAILABLE' | 'USED') {
    return this.formalizersService.findAll(status);
  }

  @Get('available')
  findAvailable() {
    return this.formalizersService.findAvailable();
  }

  @Post()
  create(@Body() dto: CreateFormalizerDto) {
    return this.formalizersService.create(dto);
  }
}
