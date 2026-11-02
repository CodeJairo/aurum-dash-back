import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { ResetPasswordDto } from '../users/dto/reset-password.dto';

@Controller('companies')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.companiesService.toggleActive(id);
  }

  @Post(':id/impersonate')
  impersonate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.companiesService.impersonate(user, id);
  }

  @Get(':id/users')
  findCompanyUsers(@Param('id') id: string) {
    return this.usersService.findAll(id);
  }

  @Post(':id/users')
  createCompanyUser(
    @Param('id') id: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(id, dto);
  }

  @Patch(':id/users/:userId')
  updateCompanyUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, userId, dto);
  }

  @Patch(':id/users/:userId/password')
  resetCompanyUserPassword(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(id, userId, dto.newPassword);
  }

  @Patch(':id/users/:userId/toggle-active')
  toggleCompanyUserActive(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.usersService.toggleActive(id, userId, currentUser?.id);
  }
}
