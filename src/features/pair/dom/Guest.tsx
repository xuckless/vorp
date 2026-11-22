// The guest's side of Pair by QR, on a stranger's phone, ported from the owner's Vorp design
// (the-wallpaper-project src/vorp/Pair.tsx, Guest): one question (their language), one tap (Join,
// which is also the tap the browser needs before it asks for the microphone). It speaks their
// language from the first frame. Light on purpose: only the blob, text and the dropdown; the
// conversation view is loaded once they are in.

import { guestCopy } from '@/config/pair-copy';
import { Blob, type Mood } from '@/ui/dom/blob';
import { Presence, Select } from '@/ui/dom/controls';
import type { Light } from '@/ui/dom/light';
import { Mark } from '@/ui/dom/Mark';

import type { GuestPageModel } from '../model';

const isIOS = () =>
  typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function Guest({ page, light, onPick, onJoin }: { page: GuestPageModel; light: Light; onPick: (language: string) => void; onJoin: () => void }) {
  const { t, dir, lang } = guestCopy(page.copy);
  const problem: Partial<Record<GuestPageModel['view'], { title: string; body: string; mood: Mood; again?: boolean }>> = {
    micDenied: { title: t('micTitle'), body: `${t('micBody')} ${isIOS() ? t('micIos') : t('micAndroid')}`, mood: 'unsure', again: true },
    used: { title: t('usedTitle'), body: t('usedBody'), mood: 'unsure' },
    expired: { title: t('expiredTitle'), body: t('expiredBody'), mood: 'sleepy' },
    hostLeft: { title: t('leftTitle'), body: t('leftBody'), mood: 'sad' },
    // The code is not spent yet in either: Join again.
    offline: { title: t('offlineTitle'), body: t('offlineBody'), mood: 'unsure', again: true },
    down: { title: t('downTitle'), body: t('downBody'), mood: 'sleepy', again: true },
  };
  const p = problem[page.view];

  return (
    <div className="vp-page vp-guest" lang={lang} dir={dir}>
      <header className="vp-bar vp-guest-bar">
        <Mark light={light} />
      </header>
      <Presence id={page.view === 'joining' ? 'pick' : page.view} exitMs={180} className="vp-guest-main">
        {page.view === 'done' ? (
          <div className="vp-guest-hero" role="status">
            <span className="vp-pulse">
              <Blob size={96} mood="happy" tint="rest" />
            </span>
            <h1>{t('doneTitle')}</h1>
            <p className="vp-mute">{t('doneBody')}</p>
          </div>
        ) : p ? (
          <div className="vp-guest-hero" role="alert">
            <Blob size={96} mood={p.mood} tint="rest" />
            <h1>{p.title}</h1>
            <p className="vp-mute vp-guest-body">{p.body}</p>
            {p.again && (
              <div className="vp-guest-actions">
                <button className="vp-primary" onClick={onJoin}>
                  {t('joinAgain')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="vp-guest-hero">
            <Blob size={96} mood="happy" tint="rest" />
            <h1>{t('hi')}</h1>
            <p className="vp-mute vp-guest-body">{t('lede')}</p>
            <div className="vp-guest-pick vp-frost">
              <div className="vp-row">
                <span>{t('youSpeak')}</span>
                <Select label={t('youSpeak')} value={page.language} options={page.choices} search placeholder={t('search')} onChange={onPick} />
              </div>
              {page.hostName && (
                <div className="vp-row vp-row-fixed" aria-disabled="true">
                  <span>{t('theySpeak')}</span>
                  <span className="vp-fixed-lang">{page.hostName}</span>
                </div>
              )}
            </div>
            <div className="vp-guest-actions">
              <button className="vp-primary" disabled={page.view === 'joining'} onClick={onJoin}>
                {page.view === 'joining' ? t('joining') : t('join')}
              </button>
              <p className="vp-mute vp-guest-note">{t('micNote')}</p>
            </div>
          </div>
        )}
      </Presence>
    </div>
  );
}
