/**
 * Reader-facing UI language. Japanese is the default voice of the site;
 * English is the alternate. The studio (admin) stays English.
 */
export type Lang = 'ja' | 'en';

const STORAGE_KEY = 'pressroom:lang';

const dict = {
  ja: {
    'lib.sub': '同人誌・校正刷り・欄外の注 — 綴じたままのかたちで。',
    'lib.loading': '校正刷りを取得中…',
    'lib.empty': 'まだ何も刷られていません',
    'lib.offline': '印刷所オフライン',
    'status.ongoing': '連載中',
    'status.complete': '完結',
    'status.oneshot': '読切',
    'ov.foreword': 'はじめに',
    'ov.chapters': '目次',
    'ov.pages': 'ページ',
    'ov.start': '読み始める',
    'ov.continue': '続きから読む',
    'ov.back': '書庫へ戻る',
    'ov.contents': '収録内容',
    'ov.front': '前付',
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
    'rd.lang': '言語',
    'rd.missing': '登録エラー — この校正刷りは綴じられていません。',
    'rd.noPages': 'この校正刷りにはまだページがありません。',
    'rd.loading': '校正刷りを取得中…',
    'nf.title': 'この校正刷りは綴じられていません。',
  },
  en: {
    'lib.sub': 'Doujinshi, proofs & margin notes — read them the way they were bound.',
    'lib.loading': 'PULLING PROOFS…',
    'lib.empty': 'NOTHING ON THE PRESS YET',
    'lib.offline': 'PRESS OFFLINE',
    'status.ongoing': 'ONGOING',
    'status.complete': 'COMPLETE',
    'status.oneshot': 'ONE-SHOT',
    'ov.foreword': 'FOREWORD',
    'ov.chapters': 'CHAPTERS',
    'ov.pages': 'PAGES',
    'ov.start': 'START READING',
    'ov.continue': 'CONTINUE',
    'ov.back': 'BACK TO THE LIBRARY',
    'ov.contents': 'CONTENTS',
    'ov.front': 'FRONT MATTER',
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
    'rd.lang': 'LANGUAGE',
    'rd.missing': 'REGISTRATION ERROR — THIS PROOF WAS NEVER BOUND.',
    'rd.noPages': 'NO PAGES IN THIS PROOF YET.',
    'rd.loading': 'PULLING THE PROOF…',
    'nf.title': 'This proof was never bound.',
  },
} as const;

export type DictKey = keyof (typeof dict)['ja'];

class I18n {
  lang = $state<Lang>('ja');

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'ja') this.lang = saved;
    }
  }

  set(lang: Lang) {
    this.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* private mode */
    }
    document.documentElement.lang = lang;
  }

  t(key: DictKey): string {
    return dict[this.lang][key] ?? dict.en[key] ?? key;
  }
}

export const i18n = new I18n();
