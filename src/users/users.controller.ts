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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CurrentCompanyId, CurrentUser } from '../auth/current-user.decorator';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@CurrentCompanyId() companyId: string) {
    return this.usersService.findAll(companyId);
  }

  @Post()
  create(
    @CurrentCompanyId() companyId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(companyId, id, dto);
  }

  @Patch(':id/password')
  resetPassword(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(companyId, id, dto.newPassword);
  }

  @Patch(':id/toggle-active')
  toggleActive(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.usersService.toggleActive(companyId, id, currentUser?.id);
  }
}
