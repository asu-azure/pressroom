/**
 * Reader-facing UI language. Japanese is the default voice of the site;
 * English is the alternate. The studio (admin) stays English.
 *
 * The site has ONE language state (see lib/lang.ts), but this chrome dictionary
 * only carries `ja` and `en`. Thai exists solely for `/asu` and the homepage
 * artist teaser, whose copy is author-edited in the Studio; a Thai visitor
 * therefore reads the artist page in Thai and the reader chrome in English via
 * the fallback in `t()`. One switcher, no second language control.
 */
import { DEFAULT_LANG, isLang, LANG_EVENT, LANG_STORAGE_KEY, type Lang } from './lang';

export type { Lang };

const STORAGE_KEY = LANG_STORAGE_KEY;

const dict = {
  ja: {
    'lib.sub': 'Asu Azure のオリジナル作品をまとめた場所。',
    'lib.loading': '本を並べています…',
    'lib.empty': 'まだ本がありません',
    'lib.offline': '接続できません',
    'lib.open': '作品を見る',
    'artist.cardK': '描いた人',
    'artist.cardTitle': 'この本たちを描いたのは誰？',
    'artist.cardCta': 'プロフィールと作品集へ',
    'status.ongoing': '連載中',
    'status.complete': '完結',
    'status.oneshot': '読切',
    'ov.foreword': 'あらすじ',
    'ov.spoiler': '※ 物語の結末まで語ります — ネタバレ注意',
    'ov.chapters': '目次',
    'ov.pages': 'ページ',
    'ov.start': '読み始める',
    'ov.continue': '続きから読む',
    'ov.back': '書庫へ戻る',
    'ov.contents': '収録内容',
    'ov.front': '前付',
    'ov.cast': '登場人物',
    'cast.file': '人物ファイル',
    'cast.close': '閉じる',
    'ov.locked': '施錠中 — 合言葉で開きます',
    'lock.title': '施錠中',
    'lock.hint': 'ヒント',
    'lock.enter': '合言葉',
    'lock.unlock': '開く',
    'lock.wrong': '合言葉が違います',
    'rd.library': '書庫',
    'rd.overview': '概要',
    'rd.note': '注',
    'rd.toc': '目次',
    'rd.settings': '閲覧設定',
    'rd.layout': 'レイアウト',
    'rd.single': '単ページ',
    'rd.spread': '見開き',
    'rd.mode': 'モード',
    'rd.flip': 'めくり',
    'rd.scroll': 'スクロール',
    'rd.fit': '表示',
    'rd.fitHeight': '高さ合わせ',
    'rd.fitWidth': '幅合わせ',
    'rd.translate': '翻訳',
    'rd.on': 'オン',
    'rd.off': 'オフ',
    'rd.panel': 'コマ',
    'rd.lang': '言語',
    'rd.missing': 'この本は見つかりません。',
    'rd.noPages': 'この本にはまだページがありません。',
    'rd.loading': '本を開いています…',
    'nf.kicker': 'ページが見つかりません',
    'nf.title': 'お探しのページは見つかりません。',
    'nf.back': '書庫へ戻る',
  },
  en: {
    'lib.sub': "Where Asu Azure's original work is collected.",
    'lib.loading': 'OPENING THE SHELF…',
    'lib.empty': 'NO BOOKS ON THE SHELF YET',
    'lib.offline': "CAN'T REACH THE SHELF",
    'lib.open': 'OPEN THIS WORK',
    'artist.cardK': 'THE ARTIST',
    'artist.cardTitle': 'Who drew all this?',
    'artist.cardCta': 'PROFILE & GALLERY',
    'status.ongoing': 'ONGOING',
    'status.complete': 'COMPLETE',
    'status.oneshot': 'ONE-SHOT',
    'ov.foreword': 'SYNOPSIS',
    'ov.spoiler': '※ TELLS THE WHOLE STORY — SPOILERS AHEAD',
    'ov.chapters': 'CHAPTERS',
    'ov.pages': 'PAGES',
    'ov.start': 'START READING',
    'ov.continue': 'CONTINUE',
    'ov.back': 'BACK TO THE LIBRARY',
    'ov.contents': 'CONTENTS',
    'ov.front': 'FRONT MATTER',
    'ov.cast': 'CHARACTERS',
    'cast.file': 'CAST FILE',
    'cast.close': 'CLOSE',
    'ov.locked': 'LOCKED — ENTER THE PASSWORD',
    'lock.title': 'LOCKED',
    'lock.hint': 'HINT',
    'lock.enter': 'PASSWORD',
    'lock.unlock': 'UNLOCK',
    'lock.wrong': 'WRONG PASSWORD',
    'rd.library': 'LIBRARY',
    'rd.overview': 'OVERVIEW',
    'rd.note': 'NOTE',
    'rd.toc': 'TOC',
    'rd.settings': 'READER SETTINGS',
    'rd.layout': 'LAYOUT',
    'rd.single': 'SINGLE',
    'rd.spread': 'SPREAD',
    'rd.mode': 'MODE',
    'rd.flip': 'FLIP',
    'rd.scroll': 'SCROLL',
    'rd.fit': 'FIT',
    'rd.fitHeight': 'HEIGHT',
    'rd.fitWidth': 'WIDTH',
    'rd.translate': 'TRANSLATION',
    'rd.on': 'ON',
    'rd.off': 'OFF',
    'rd.panel': 'PANEL',
    'rd.lang': 'LANGUAGE',
    'rd.missing': "THIS BOOK ISN'T HERE.",
    'rd.noPages': 'NO PAGES IN THIS BOOK YET.',
    'rd.loading': 'OPENING THE BOOK…',
    'nf.kicker': 'PAGE NOT FOUND',
    'nf.title': "This page isn't on the shelf.",
    'nf.back': 'BACK TO THE LIBRARY',
  },
} as const;

export type DictKey = keyof (typeof dict)['ja'];

class I18n {
  lang = $state<Lang>(DEFAULT_LANG);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLang(saved)) this.lang = saved;
    }
    // The shell ships <html lang="ja">; a restored preference has to move it too,
    // or screen readers and browser translation read the whole page as Japanese.
    if (typeof document !== 'undefined') document.documentElement.lang = this.lang;
  }

  set(lang: Lang) {
    this.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* private mode */
    }
    document.documentElement.lang = lang;
    // Static Astro markup (the homepage artist teaser) cannot read a rune, so
    // the switch is also announced on the DOM. One control, two rendering
    // worlds — see applyCopy() in lib/siteCopy.ts.
    document.dispatchEvent(new CustomEvent<Lang>(LANG_EVENT, { detail: lang }));
  }

  t(key: DictKey): string {
    // Indexed loosely on purpose: `th` has no chrome table and must fall through
    // to English rather than throw.
    const table = (dict as Record<string, Record<string, string>>)[this.lang];
    return table?.[key] ?? dict.en[key] ?? key;
  }
}

export const i18n = new I18n();
