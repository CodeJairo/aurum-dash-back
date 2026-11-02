import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('settings')
@UseGuards(AuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(@CurrentCompanyId() companyId: string) {
    return this.settingsService.getSettings(companyId);
  }

  @Put()
  @Roles(Role.ADMIN)
  updateSettings(
    @CurrentCompanyId() companyId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(companyId, dto);
  }

  @Get('preview-consecutive')
  previewConsecutive(@CurrentCompanyId() companyId: string) {
    return this.settingsService.getNextConsecutivePreview(companyId);
  }
}
