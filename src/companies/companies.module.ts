import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { UsersModule } from '../users/users.module';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [UsersModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, SubscriptionsService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
