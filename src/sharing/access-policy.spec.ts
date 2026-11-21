import { AccessContext, canReadBook, canReadChapter, levelAllows, PolicyBook, PolicyChapter } from './access-policy';

const AUTHOR = 'author';
const READER = 'reader';

const book = (visibility: PolicyBook['visibility']): PolicyBook => ({ id: 'b1', authorId: AUTHOR, visibility });
const chapter = (
  visibility: PolicyChapter['visibility'],
  status: PolicyChapter['status'] = 'published',
  id = 'c1',
): PolicyChapter => ({ id, bookId: 'b1', visibility, status });

const ctx = (over: Partial<AccessContext> = {}): AccessContext => ({
  viewerId: READER,
  isFriendOfAuthor: false,
  shareLink: null,
  grants: [],
  ...over,
});
const ids = ['c1', 'c2'];

describe('levelAllows', () => {
  it.each([
    ['public', {}, true],
    ['private', {}, false],
    ['friends', { isFriend: true }, true],
    ['friends', { hasToken: true }, false],
    ['link', { hasToken: true }, true],
    ['link', { isFriend: true }, false],
    ['private', { hasGrant: true }, true],
  ] as const)('%s with %o → %s', (level, input, expected) => {
    expect(levelAllows(level, { hasGrant: false, hasToken: false, isFriend: false, ...input })).toBe(expected);
  });
});

describe('canReadBook', () => {
  it("l'auteur lit toujours son livre privé", () => {
    expect(canReadBook(book('private'), ids, ctx({ viewerId: AUTHOR }))).toBe(true);
  });
  it('un visiteur anonyme ne lit pas un livre privé, amis ou lien', () => {
    for (const v of ['private', 'friends', 'link'] as const) {
      expect(canReadBook(book(v), ids, ctx({ viewerId: null }))).toBe(false);
    }
  });
  it('un livre public est lisible par tous', () => {
    expect(canReadBook(book('public'), ids, ctx({ viewerId: null }))).toBe(true);
  });
  it('« amis » exige une amitié acceptée', () => {
    expect(canReadBook(book('friends'), ids, ctx())).toBe(false);
    expect(canReadBook(book('friends'), ids, ctx({ isFriendOfAuthor: true }))).toBe(true);
  });
  it('« lien » exige un lien valide sur le livre ou un de ses chapitres', () => {
    expect(canReadBook(book('link'), ids, ctx({ shareLink: { resourceType: 'book', resourceId: 'b1' } }))).toBe(true);
    expect(canReadBook(book('link'), ids, ctx({ shareLink: { resourceType: 'chapter', resourceId: 'c2' } }))).toBe(true);
    expect(canReadBook(book('link'), ids, ctx({ shareLink: { resourceType: 'book', resourceId: 'autre' } }))).toBe(false);
  });
  it('un lien ne suffit pas sur un livre redevenu privé', () => {
    expect(canReadBook(book('private'), ids, ctx({ shareLink: { resourceType: 'book', resourceId: 'b1' } }))).toBe(false);
  });
  it('une invitation ouvre un livre privé', () => {
    expect(canReadBook(book('private'), ids, ctx({ grants: [{ resourceType: 'book', resourceId: 'b1' }] }))).toBe(true);
  });
});

describe('canReadChapter', () => {
  it("un brouillon n'est jamais visible d'un non-auteur", () => {
    expect(canReadChapter(book('public'), chapter('public', 'draft'), ids, ctx())).toBe(false);
    expect(canReadChapter(book('public'), chapter('public', 'draft'), ids, ctx({ viewerId: AUTHOR }))).toBe(true);
  });
  it("un chapitre public d'un livre privé reste inaccessible", () => {
    expect(canReadChapter(book('private'), chapter('public'), ids, ctx())).toBe(false);
  });
  it('un chapitre privé dans un livre public est réservé à l’auteur', () => {
    expect(canReadChapter(book('public'), chapter('private'), ids, ctx())).toBe(false);
  });
  it("un lien sur un chapitre n'ouvre pas les autres chapitres « lien »", () => {
    const c = ctx({ shareLink: { resourceType: 'chapter', resourceId: 'c1' } });
    expect(canReadChapter(book('link'), chapter('link', 'published', 'c1'), ids, c)).toBe(true);
    expect(canReadChapter(book('link'), chapter('link', 'published', 'c2'), ids, c)).toBe(false);
  });
  it('une invitation sur le livre couvre ses chapitres, sauf les chapitres privés', () => {
    const c = ctx({ grants: [{ resourceType: 'book', resourceId: 'b1' }] });
    expect(canReadChapter(book('private'), chapter('friends'), ids, c)).toBe(true);
    expect(canReadChapter(book('private'), chapter('private'), ids, c)).toBe(false);
  });
  it('une invitation sur un chapitre privé ouvre ce chapitre', () => {
    const c = ctx({ grants: [{ resourceType: 'chapter', resourceId: 'c1' }] });
    expect(canReadChapter(book('private'), chapter('private'), ids, c)).toBe(true);
  });
  it("refuse un chapitre qui n'appartient pas au livre", () => {
    expect(canReadChapter(book('public'), { ...chapter('public'), bookId: 'x' }, ids, ctx())).toBe(false);
  });
});
