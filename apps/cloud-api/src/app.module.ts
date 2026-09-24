import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { PlansModule } from './plans/plans.module';
import { LayoutsModule } from './layouts/layouts.module';
import { MediaModule } from './media/media.module';
import { ScenesModule } from './scenes/scenes.module';
import { DevicesModule } from './devices/devices.module';
import { SchedulesModule } from './schedules/schedules.module';
import { EdgeModule } from './edge/edge.module';
import { ReportsModule } from './reports/reports.module';
import { UploadsModule } from './uploads/uploads.module';
import { ScreenTypesModule } from './screen-types/screen-types.module';
import { UsersModule } from './users/users.module';
import { HistoryModule } from './history/history.module';
import { StorageModule } from './storage/storage.module';
import { CapacityModule } from './capacity/capacity.module';
import { DeviceGroupsModule } from './device-groups/device-groups.module';
import { TickerModule } from './ticker/ticker.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    AuthModule,
    ClientsModule,
    UsersModule,
    CapacityModule,
    DeviceGroupsModule,
    PlansModule,
    ScreenTypesModule,
    LayoutsModule,
    MediaModule,
    ScenesModule,
    DevicesModule,
    SchedulesModule,
    EdgeModule,
    ReportsModule,
    UploadsModule,
    HistoryModule,
    TickerModule,
  ],
})
export class AppModule {}
