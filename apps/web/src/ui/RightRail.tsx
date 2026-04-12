import { LettersGrid } from './LettersGrid';
import { Prototypes } from './Prototypes';

// Shared right-column contents: letters grid on top, centroids below.
// Visible across all tabs; clicking a tile on the grid also jumps the
// Calibrate tab there.
export function RightRail() {
  return (
    <>
      <LettersGrid />
      <Prototypes />
    </>
  );
}
