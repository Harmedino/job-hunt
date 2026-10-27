'use client';
import { useEffect } from 'react';
export default function ShareRegistration(){useEffect(()=>{if('serviceWorker' in navigator)void navigator.serviceWorker.register('/share-worker.js').catch(()=>{});},[]);return null;}
