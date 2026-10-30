import type { PlayerBottomBarProps } from "@/types/bottom.modern";

import Controls from "../media/controls.player";
import PlayerSlimBar from "../media/slim.player";
import Timeline from "../media/timeline.player";
import ModernControls from "./controls.modern";

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
