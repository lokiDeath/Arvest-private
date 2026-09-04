'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/store';
import { InactivityGuard } from '@/components/banking/inactivity-guard';
import { NotificationBell } from '@/components/banking/notification-bell';
import { Button } from '@/components/ui/button';
import { Search, Menu, Settings, LogOut, Camera } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

// Compress avatar to 400px JPEG 0.8 quality data URL
function compressAvatar(file: File, maxSize = 400, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CustomerTopbar({ onMenu }: { onMenu: () => void }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const refresh = useAuth((s) => s.refresh);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] || 'there';
  const memberYear = user?.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear();

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10 MB');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await compressAvatar(file);
      const res = await fetch('/api/profile/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Upload failed');
        return;
      }
      toast.success('Profile picture updated');
      refresh();
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const handleInactivityLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <>
      <InactivityGuard onLogout={handleInactivityLogout} />
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 lg:px-8 h-16 max-w-7xl mx-auto">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu}>
            <Menu className="w-5 h-5" />
          </Button>

          {/* Greeting visible on ALL screen sizes */}
          <div className="min-w-0 flex-1 lg:flex-none">
            <div className="text-[10px] sm:text-[11px] text-muted-foreground tracking-wider uppercase truncate">{today}</div>
            <div className="text-sm font-medium truncate">
              {greeting}, {firstName}
              <span className="hidden md:inline text-muted-foreground font-normal"> · Customer since {memberYear}</span>
            </div>
          </div>

          <div className="flex-1 max-w-md mx-auto hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions, payees, accounts…"
                className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:border-border"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <NotificationBell />

            {/* Avatar + menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors relative group" disabled={uploading}>
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" key={user.avatarUrl} />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                      {user?.name?.charAt(0)}
                    </div>
                  )}
                  <span className="hidden sm:block text-sm font-medium">{firstName}</span>
                  <div className="absolute inset-0 rounded-md bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    {uploading ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Signed in as<br />
                  <span className="text-foreground text-sm font-medium">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Camera className="w-4 h-4 mr-2" /> {uploading ? 'Uploading…' : 'Change profile picture'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { window.location.hash = '/profile'; }}>
                  <Settings className="w-4 h-4 mr-2" /> Profile & Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { logout().then(() => { window.location.href = '/'; }); }} className="text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={handleAvatarChange} disabled={uploading}
            />
          </div>
        </div>
      </header>
    </>
  );
}
