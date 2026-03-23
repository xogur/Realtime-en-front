'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const CopyrightAttribution = () => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기 기능
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end" ref={popoverRef}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="mb-3 p-4 bg-zinc-900/90 backdrop-blur-md rounded-2xl text-[11px] text-zinc-300 shadow-2xl border border-white/10 w-72 md:w-80"
          >
            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
              <h4 className="font-bold text-white uppercase tracking-wider">Credits & Attribution</h4>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <ul className="space-y-3">
              <li className="flex flex-col">
                <span className="text-zinc-500 mb-0.5">3D Model (Gregory)</span>
                <span className="text-blue-400 font-medium cursor-default">
                  "Gregory (Street Outfit)" by Vladislav Kolesnikov
                </span>
              </li>
              
              <li className="flex flex-col">
                <span className="text-zinc-500 mb-0.5">3D Model (Flavio)</span>
                <span className="text-blue-400 font-medium cursor-default">
                  "AVATAR FLAVIO MAYERHOFER" by fmayerhofer
                </span>
              </li>
              
              <li className="flex flex-col">
                <span className="text-zinc-500 mb-0.5">3D Model (My Avatar)</span>
                <span className="text-blue-400 font-medium cursor-default">
                  "634230021 My Avatar" by 634230021
                </span>
              </li>

              <li className="flex flex-col pt-2 border-t border-white/5">
                <span className="text-zinc-500 mb-0.5">Avatar Creation Tool</span>
                <span className="text-emerald-400 font-medium italic cursor-default">
                  Streamoji Avatar Creator
                </span>
              </li>
            </ul>
            
            <div className="mt-4 pt-2 border-t border-white/10 flex justify-between items-center text-[9px] text-zinc-500">
              <p>All models licensed under CC BY 4.0</p>
              <span className="cursor-default">License Info</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-2 px-3 py-1.5 bg-zinc-900/40 hover:bg-zinc-900/60 backdrop-blur-sm rounded-full border border-white/5 transition-all duration-300"
      >
        <span className="text-[10px] font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors">
          © Credits
        </span>
        <div className={`w-1 h-1 rounded-full transition-colors ${isOpen ? 'bg-blue-400' : 'bg-zinc-600 group-hover:bg-zinc-400'}`} />
      </button>
    </div>
  );
};
