import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Profile } from './entities/profile.entity';
import { Session } from './entities/session.entity';
import { UserSettings } from './entities/user-settings.entity';
import { UserToken } from './entities/user-token.entity';
import { User } from './entities/user.entity';
import { MeController } from './me.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Profile, Session, UserSettings, UserToken])],
  controllers: [AuthController, MeController, UsersController],
  providers: [AuthService, UsersService],
  exports: [UsersService],
})
export class IdentityModule {}
