import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaPlayerProps {
  src: string;
  type: 'audio' | 'video';
  poster?: string;
  mimeType?: string;
  className?: string;
  isVoiceMessage?: boolean;
}

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

// Generate stable waveform bars based on src
const generateWaveformBars = (seed: string, count: number = 35) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  
  return Array.from({ length: count }).map((_, i) => {
    const seedVal = Math.abs(hash + i * 31);
    return 25 + (seedVal % 50);
  });
};

export const MediaPlayer: React.FC<MediaPlayerProps> = ({ 
  src, 
  type, 
  poster, 
  mimeType, 
  className,
  isVoiceMessage = false 
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState(false);

  // Stable waveform bars
  const waveformBars = useMemo(() => generateWaveformBars(src), [src]);

  const mediaRef = type === 'audio' ? audioRef : videoRef;

  useEffect(() => {
    const m = mediaRef.current;
    if (!m) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(m.currentTime);
    const onDuration = () => {
      if (m.duration && isFinite(m.duration)) {
        setDuration(m.duration);
      }
    };
    const onLoaded = () => {
      setIsLoaded(true);
      setError(false);
      if (m.duration && isFinite(m.duration)) {
        setDuration(m.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => setError(true);

    m.addEventListener('play', onPlay);
    m.addEventListener('pause', onPause);
    m.addEventListener('timeupdate', onTime);
    m.addEventListener('loadedmetadata', onDuration);
    m.addEventListener('loadeddata', onLoaded);
    m.addEventListener('canplaythrough', onLoaded);
    m.addEventListener('ended', onEnded);
    m.addEventListener('error', onError);

    // Try to load duration immediately
    if (m.readyState >= 1 && m.duration && isFinite(m.duration)) {
      setDuration(m.duration);
      setIsLoaded(true);
    }

    return () => {
      m.removeEventListener('play', onPlay);
      m.removeEventListener('pause', onPause);
      m.removeEventListener('timeupdate', onTime);
      m.removeEventListener('loadedmetadata', onDuration);
      m.removeEventListener('loadeddata', onLoaded);
      m.removeEventListener('canplaythrough', onLoaded);
      m.removeEventListener('ended', onEnded);
      m.removeEventListener('error', onError);
    };
  }, [src, mediaRef]);

  useEffect(() => {
    const m = mediaRef.current;
    if (m) {
      m.volume = volume;
      m.muted = muted;
      m.playbackRate = playbackRate;
    }
  }, [volume, muted, playbackRate, mediaRef]);

  const togglePlay = async () => {
    const m = mediaRef.current;
    if (!m) return;
    
    try {
      if (m.paused) {
        await m.play();
      } else {
        m.pause();
      }
    } catch (e) {
      console.error('Error playing media:', e);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const m = mediaRef.current;
    if (!m || !isFinite(duration) || duration <= 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    m.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    setPlaybackRate(rates[nextIndex]);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // WhatsApp style audio player
  if (type === 'audio') {
    return (
      <div className={cn('w-full max-w-[280px]', className)}>
        <audio 
          ref={audioRef} 
          src={src} 
          preload="auto"
          crossOrigin="anonymous"
        />
        
        <div className="flex items-center gap-2">
          {/* Play/Pause button */}
          <button
            aria-label={isPlaying ? 'Pausar' : 'Tocar'}
            onClick={togglePlay}
            disabled={error}
            className={cn(
              "inline-flex items-center justify-center rounded-full shrink-0 transition-all",
              "h-10 w-10 bg-emerald-500 text-white hover:bg-emerald-600",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </button>

          {/* Progress section */}
          <div className="flex-1 min-w-0">
            {/* Waveform progress bar */}
            <div 
              className="relative h-7 flex items-center cursor-pointer"
              onClick={handleSeek}
            >
              <div className="w-full h-full flex items-center gap-[1px]">
                {waveformBars.map((height, i) => {
                  const barProgress = ((i + 1) / waveformBars.length) * 100;
                  const isActive = barProgress <= progress;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 rounded-full transition-colors duration-100",
                        isActive ? "bg-emerald-600" : "bg-muted-foreground/25"
                      )}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>
            </div>
            
            {/* Time display */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{formatTime(isPlaying ? currentTime : duration)}</span>
              <button
                onClick={cyclePlaybackRate}
                className="font-medium hover:text-foreground transition-colors"
              >
                {playbackRate}x
              </button>
            </div>
          </div>

          {/* Voice message icon */}
          {isVoiceMessage && (
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Mic className="h-4 w-4 text-emerald-600" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Video player (keep similar style but improved)
  return (
    <div className={cn('w-full max-w-md', className)}>
      <div className="relative rounded-lg overflow-hidden bg-black">
        <video
          ref={(el) => (mediaRef.current = el)}
          src={src}
          poster={poster}
          className="w-full"
          controls={false}
          onClick={togglePlay}
        />
        
        {/* Play overlay */}
        {!isPlaying && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="h-14 w-14 rounded-full bg-primary/90 flex items-center justify-center">
              <Play className="h-7 w-7 text-primary-foreground ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mt-2 px-1">
        <button
          aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          onClick={togglePlay}
          className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground shrink-0"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        <div className="flex-1">
          <div className="relative h-1 bg-muted rounded-full overflow-hidden">
            <div 
              className="absolute h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={onSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setMuted(m => !m)}
            className="p-1 rounded hover:bg-muted"
            aria-label={muted ? 'Desmutar' : 'Mutar'}
          >
            {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button onClick={download} className="p-1 rounded hover:bg-muted" aria-label="Download">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaPlayer;
