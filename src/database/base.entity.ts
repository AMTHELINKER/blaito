import {
  BeforeInsert,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

/** Horodatages communs à toutes les tables. */
export abstract class Timestamped {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

/** Entité à clé primaire UUID v7 (triable dans le temps, sûre à exposer). */
export abstract class UuidEntity extends Timestamped {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  protected assignId(): void {
    if (!this.id) this.id = uuidv7();
  }
}

/** Contenu supprimable en douceur. */
export abstract class SoftDeletableEntity extends UuidEntity {
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

export const newId = (): string => uuidv7();
