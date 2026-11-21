/**
 * Données de développement (jamais exécuté en production).
 *   pnpm seed   →  compte demo@laito.app / laito-demo
 */
import 'reflect-metadata';
import { hash } from '@node-rs/argon2';
import { DEFAULT_READING_PREFERENCES, countWords, slugify, toPlainText } from '../../shared';
import dataSource from '../data-source';
import { Profile } from '../../identity/entities/profile.entity';
import { UserSettings } from '../../identity/entities/user-settings.entity';
import { User } from '../../identity/entities/user.entity';
import { Book } from '../../writing/entities/book.entity';
import { ChapterContent } from '../../writing/entities/chapter-content.entity';
import { Chapter } from '../../writing/entities/chapter.entity';

const CHAPTERS: [string, string][] = [
  [
    'La maison au bord du sel',
    `Il y avait, au bout de la route des marais, une maison que la mer avait oubliée.

Ses volets bleus s'écaillaient doucement, comme on perd ses souvenirs : un peu chaque hiver, sans y penser.

> Ce que la mer reprend, elle le rend toujours ailleurs.

Clémence y arriva un mardi, avec une valise et une lettre qu'elle n'avait pas encore ouverte.

* * *

La clé était sous la troisième pierre, exactement là où sa grand-mère l'avait promis.`,
  ],
  [
    'Les carnets',
    `Dans le grenier, sous une couverture de laine, dormaient vingt-trois carnets.

Chacun portait une date, et une seule phrase en première page :

- *Ce que j'ai vu.*
- *Ce que j'ai cru voir.*
- *Ce que je n'ai jamais dit.*

Clémence s'assit sur le plancher et commença par le dernier.`,
  ],
];

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed interdit en production');
  await dataSource.initialize();
  await dataSource.transaction(async (em) => {
    const email = 'demo@laito.app';
    let user = await em.findOneBy(User, { email });
    if (user) {
      console.log('Données de démo déjà présentes.');
      return;
    }
    user = await em.save(
      em.create(User, {
        email,
        passwordHash: await hash('laito-demo'),
        emailVerifiedAt: new Date(),
      }),
    );
    await em.save(
      em.create(Profile, {
        userId: user.id,
        username: 'demo',
        displayName: 'Camille Demo',
        bio: 'Autrice de démonstration. J’écris des histoires de mer et de mémoire.',
        links: [],
      }),
    );
    await em.save(
      em.create(UserSettings, { userId: user.id, onboardingCompleted: true, readingPreferences: DEFAULT_READING_PREFERENCES }),
    );
    const book = await em.save(
      em.create(Book, {
        authorId: user.id,
        title: 'Les Jardins de Sel',
        slug: slugify('Les Jardins de Sel'),
        summary: 'Une maison oubliée par la mer, vingt-trois carnets, et une lettre jamais ouverte.',
        genre: 'roman',
        status: 'in_progress',
        visibility: 'public',
        publishedAt: new Date(),
      }),
    );
    let total = 0;
    for (const [i, [title, content]] of CHAPTERS.entries()) {
      const words = countWords(content);
      total += words;
      const ch = await em.save(
        em.create(Chapter, {
          bookId: book.id,
          title,
          position: i,
          status: 'published',
          visibility: 'public',
          wordCount: words,
          publishedAt: new Date(),
        }),
      );
      await em.save(em.create(ChapterContent, { chapterId: ch.id, content, contentText: toPlainText(content), version: 1 }));
    }
    await em.update(Book, { id: book.id }, { wordCount: total });
    console.log('Compte de démo créé : demo@laito.app / laito-demo');
  });
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
