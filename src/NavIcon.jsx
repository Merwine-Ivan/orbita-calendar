import React from 'react';
export function NavIcon({name,size=22}){
 const paths={
 calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h2M14 14h2M8 18h2"/></>,
 groups:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
 stats:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16v-4m4 4V8m4 8v-6"/></>,
 users:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
 profile:<><circle cx="12" cy="8" r="4"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/></>,
 audit:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/></>,
 trash:<><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m5 4v7m4-7v7"/></>,
 database:<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v7c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12v7c0 1.66 4.03 3 9 3s9-1.34 9-3v-7"/></>,
 more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
 logout:<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/></>,
 left:<><path d="m15 18-6-6 6-6"/></>,right:<><path d="m9 18 6-6-6-6"/></>,
 close:<><path d="M18 6 6 18M6 6l12 12"/></>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true" className="nav-svg">{paths[name]||paths.more}</svg>;
}
