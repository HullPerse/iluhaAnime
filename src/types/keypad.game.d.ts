export interface GameKeypadProps {
  /** Keys held right now, merged from physical presses and pointer presses. */
  pressedKeys: ReadonlySet<number>;
  /** False outside a running session: the caps stay inert. */
  enabled: boolean;
  onPress: (key: number, pressed: boolean) => void;
}
