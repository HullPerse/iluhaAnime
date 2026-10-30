import type { PlayerStream } from "@/hooks/player/stream.hook";
import type { PlayerBottomBarKind } from "@/lib/player/view.utils";
import type { MpvChapter, MpvTrack } from "@/types/videoPlayer";

import Controls from "../media/controls.player";
import PlayerSlimBar from "../media/slim.player";
import Timeline from "../media/timeline.player";
import ModernControls from "./controls.modern";

export interface PlayerBottomBarProps {
  variant: PlayerBottomBarKind;
  playerType: "default" | "modern";
  hasFile: boolean;
  paused: boolean;
  duration: number;
  chapters: MpvChapter[];
  tracks: MpvTrack[];
  hasPrev: boolean;
  hasNext: boolean;
  immersive: boolean;
  autoHide: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  playlistOpen: boolean;
  seekTarget: number | null;
  onPlay: () => void;
  onPause: () => void;
  onPlayPause: () => void;
  onSeekTo: (seconds: number) => void;
  onScrub: (time: number) => void;
  onCommitSeek: (time: number) => void;
  onFilePrev: () => void;
  onFileNext: () => void;
  onFrameStep: (forward: boolean) => void;
  onCycleSub: () => void;
  onSpeed: (speed: number) => void;
  onVolume: (volume: number) => void;
  onMute: () => void;
  onToggleAutoHide: () => void;
  onTogglePlaylist: () => void;
  onSelectAudio: (id: number | "no") => void;
  onSelectSub: (id: number | "no") => void;
  onAddAudio: () => void;
  onAddSubtitle: () => void;
  hideTracks: boolean;
  stream: PlayerStream;
}

function PlayerBottomBar(props: PlayerBottomBarProps) {
  const {
    variant,
    playerType,
    hasFile,
    paused,
    duration,
    chapters,
    tracks,
    hasPrev,
    hasNext,
    immersive,
    autoHide,
    speed,
    volume,
    muted,
    playlistOpen,
    seekTarget,
    onPlay,
    onPause,
    onPlayPause,
    onSeekTo,
    onScrub,
    onCommitSeek,
    onFilePrev,
    onFileNext,
    onFrameStep,
    onCycleSub,
    onSpeed,
    onVolume,
    onMute,
    onToggleAutoHide,
    onTogglePlaylist,
    onSelectAudio,
    onSelectSub,
    onAddAudio,
    onAddSubtitle,
    hideTracks,
    stream,
  } = props;
  if (variant === "slim") {
    return (
      <PlayerSlimBar
        paused={paused}
        hasFile={hasFile}
        duration={duration}
        chapters={chapters}
        seekTarget={seekTarget}
        onPlayPause={onPlayPause}
        onScrub={onScrub}
        onCommitSeek={onCommitSeek}
      />
    );
  }
  if (playerType === "modern") {
    return (
      <ModernControls
        paused={paused}
        duration={duration}
        chapters={chapters}
        tracks={tracks}
        hasPrev={hasPrev}
        hasNext={hasNext}
        immersive={immersive}
        autoHide={autoHide}
        volume={volume}
        muted={muted}
        playlistOpen={playlistOpen}
        seekTarget={seekTarget}
        onPlay={onPlay}
        onPause={onPause}
        onSeekTo={onSeekTo}
        onScrub={onScrub}
        onCommitSeek={onCommitSeek}
        onFilePrev={onFilePrev}
        onFileNext={onFileNext}
        onFrameStep={onFrameStep}
        onCycleSub={onCycleSub}
        onVolume={onVolume}
        onMute={onMute}
        onToggleAutoHide={onToggleAutoHide}
        onTogglePlaylist={onTogglePlaylist}
        stream={stream}
      />
    );
  }
  return (
    <>
      <Timeline
        duration={duration}
        chapters={chapters}
        seekTarget={seekTarget}
        onScrub={onScrub}
        onCommitSeek={onCommitSeek}
      />
      <Controls
        paused={paused}
        duration={duration}
        chapters={chapters}
        tracks={tracks}
        hasPrev={hasPrev}
        hasNext={hasNext}
        immersive={immersive}
        autoHide={autoHide}
        speed={speed}
        volume={volume}
        muted={muted}
        playlistOpen={playlistOpen}
        onPlay={onPlay}
        onPause={onPause}
        onSeekTo={onSeekTo}
        onFilePrev={onFilePrev}
        onFileNext={onFileNext}
        onSpeed={onSpeed}
        onVolume={onVolume}
        onMute={onMute}
        onToggleAutoHide={onToggleAutoHide}
        onTogglePlaylist={onTogglePlaylist}
        onSelectAudio={onSelectAudio}
        onSelectSub={onSelectSub}
        onAddAudio={onAddAudio}
        onAddSubtitle={onAddSubtitle}
        hideTracks={hideTracks}
        stream={stream}
      />
    </>
  );
}

export default PlayerBottomBar;
