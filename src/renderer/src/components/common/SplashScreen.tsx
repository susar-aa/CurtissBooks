import React, { useEffect, useRef, useState } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import animationData from '../../assets/logo/Curtiss Books SWRDB Animation.json';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Load Lottie Animation
    const anim = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: animationData,
    });
    animRef.current = anim;

    let holdTimer: NodeJS.Timeout | null = null;

    anim.addEventListener('complete', () => {
      setAnimationFinished(true);
      // Keep for 3 seconds after the animation finishes, then navigate to login
      holdTimer = setTimeout(() => {
        onComplete();
      }, 3000);
    });

    // Safety fallback: if complete event doesn't fire within 15 seconds, proceed
    const safetyTimer = setTimeout(() => {
      onComplete();
    }, 15000);

    return () => {
      if (holdTimer) clearTimeout(holdTimer);
      clearTimeout(safetyTimer);
      anim.destroy();
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-white dark:bg-zinc-950 p-8 select-none transition-opacity duration-500 font-sans">
      <div className="w-full flex justify-end">
        {/* Optional subtle indicator when holding */}
        {animationFinished && (
          <div className="flex items-center space-x-1.5 text-xs text-zinc-400 dark:text-zinc-500 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>Ready</span>
          </div>
        )}
      </div>

      <div className="w-full max-w-2xl px-6 flex flex-col items-center justify-center my-auto">
        <div ref={containerRef} className="w-full h-64 sm:h-80 flex items-center justify-center drop-shadow-md" />
      </div>

      <div className="w-full text-center pb-4 text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
        Developped By Curtiss &bull;{' '}
        <span className="text-zinc-700 dark:text-zinc-300 font-semibold">www.trycurtiss.com</span>
      </div>
    </div>
  );
};
