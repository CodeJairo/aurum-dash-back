import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentCompanyId } from '../auth/current-user.decorator';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getExecutiveSummary(@CurrentCompanyId() companyId: string) {
    return this.dashboardService.getExecutiveSummary(companyId);
  }
}
