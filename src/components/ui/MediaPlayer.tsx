import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume, VolumeX, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaPlayerProps {
  src: string;
  type: 'audio' | 'video';
  poster?: string;
  mimeType?: string;
  className?: string;
}

const formatTime = (s: number) => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

export const MediaPlayer: React.FC<MediaPlayerProps> = ({ src, type, poster, mimeType, className }) => {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const m = mediaRef.current;
    if (!m) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(m.currentTime);
    const onDuration = () => setDuration(m.duration || 0);
    const onLoaded = () => setLoading(false);

    m.addEventListener('play', onPlay);
    m.addEventListener('pause', onPause);
    m.addEventListener('timeupdate', onTime);
    m.addEventListener('loadedmetadata', onDuration);
    m.addEventListener('loadeddata', onLoaded);

    return () => {
      m.removeEventListener('play', onPlay);
      m.removeEventListener('pause', onPause);
      m.removeEventListener('timeupdate', onTime);
      m.removeEventListener('loadedmetadata', onDuration);
      m.removeEventListener('loadeddata', onLoaded);
    };
  }, [src]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = volume;
      mediaRef.current.muted = muted;
    }
  }, [volume, muted]);

  const togglePlay = async () => {
    const m = mediaRef.current;
    if (!m) return;
    if (m.paused) {
      try {
        await m.play();
      } catch (e) {
        // ignore
      }
    } else {
      m.pause();
    }
  };

  const onSeek = (value: number) => {
    const m = mediaRef.current;
    if (!m || !isFinite(duration)) return;
    m.currentTime = value;
    setCurrentTime(value);
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className={cn('w-full', className)}>
      <div className={cn(type === 'video' ? 'relative' : 'flex items-center gap-3')}>
        {type === 'video' ? (
          <video
            ref={(el) => (mediaRef.current = el)}
            src={src}
            poster={poster}
            className="w-full rounded-md bg-black"
            controls={false}
          />
        ) : (
          <audio ref={(el) => (mediaRef.current = el)} src={src} className="w-full" />
        )}
      </div>

      <div className="flex items-center gap-3 mt-2">
        <button
          aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          onClick={togglePlay}
          className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(m => !m)}
            className="p-1 rounded"
            aria-label={muted ? 'Desmutar' : 'Mutar'}
          >
            {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-20"
          />
          <button onClick={download} className="p-1 rounded" aria-label="Download">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaPlayer;
