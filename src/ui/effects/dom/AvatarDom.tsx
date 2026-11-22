'use dom';

// Expo DOM component: the bot avatar.


import { BotAvatar, type BotAvatarState, type BotAvatarType } from '../vendor/bot-avatars';
import { DomPage, type DOMProps } from './page';

export default function AvatarDom({
  type,
  state,
  talk,
  size,
  color,
  dark,
  paused,
  label,
}: {
  type: BotAvatarType;
  state: BotAvatarState;
  /** A getter only on web, where this renders inline; native passes sampled numbers. */
  talk: number | (() => number);
  size: number;
  color?: string;
  dark: boolean;
  paused: boolean;
  label: string;
  dom?: DOMProps;
}) {
  return (
    <DomPage>
      <BotAvatar type={type} face="mouth" talk={talk} state={state} size={size} color={color} theme={dark ? 'dark' : 'light'} paused={paused} aria-label={label} />
    </DomPage>
  );
}
