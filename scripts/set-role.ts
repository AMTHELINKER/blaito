/**
 * Attribue un rôle à un compte existant (créé normalement par inscription).
 *
 *   pnpm user:role vous@exemple.fr admin        (user | moderator | admin)
 *   ENV_FILE=.env.production pnpm user:role vous@exemple.fr admin
 *
 * Volontairement hors de l'API : aucune route ne permet de s'attribuer un rôle.
 * Le nouveau rôle s'applique à la prochaine connexion (ou au plus tard sous 15 min).
 */
import '../src/load-env';
import 'reflect-metadata';
import dataSource from '../src/database/data-source';
import { User } from '../src/identity/entities/user.entity';
import type { UserRole } from '../src/shared';

const ROLES: UserRole[] = ['user', 'moderator', 'admin'];

async function main() {
  const [email, role] = process.argv.slice(2) as [string | undefined, UserRole | undefined];
  if (!email || !role || !ROLES.includes(role)) {
    throw new Error(`Usage : pnpm user:role <email> <${ROLES.join('|')}>`);
  }
  await dataSource.initialize();
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://localhost').hostname;
  console.log(`Base : ${host}`);
  const users = dataSource.getRepository(User);
  const user = await users.findOneBy({ email: email.trim().toLowerCase() });
  if (!user) {
    throw new Error(
      `Aucun compte pour ${email}. Inscrivez-vous d'abord sur l'application, puis relancez.`,
    );
  }
  if (!user.emailVerifiedAt) {
    throw new Error(`Le compte ${email} n'a pas encore vérifié son adresse e-mail.`);
  }
  const before = user.role;
  if (before === role) {
    console.log(`${email} a déjà le rôle « ${role} ».`);
  } else {
    await users.update({ id: user.id }, { role });
    console.log(`✅ ${email} : ${before} → ${role}. Reconnectez-vous pour l'appliquer.`);
  }
  await dataSource.destroy();
}

main().catch(async (err: Error) => {
  console.error(`\n❌ ${err.message}`);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
