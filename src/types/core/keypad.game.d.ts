export interface GameKeypadProps {
  pressedKeys: ReadonlySet<number>;
  enabled: boolean;
  onPress: (key: number, pressed: boolean) => void;
}
