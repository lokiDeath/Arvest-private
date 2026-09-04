'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import {
  Shield, Lock, Eye, EyeOff, ArrowRight, KeyRound, ChevronLeft,
  Sparkles, TrendingUp, Users, Clock, User, HelpCircle, AlertCircle, Loader2,
} from 'lucide-react';

type Step = 'loginId' | 'password' | 'forgot' | 'verify';

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  // Step state
  const [step, setStep] = useState<Step>('loginId');

  // Step 1 — Login ID
  const [loginId, setLoginId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  // Failed login attempts on Login ID step — after 3, show "Invalid login ID, please try again." + help options
  const [loginIdAttempts, setLoginIdAttempts] = useState(0);
  const [showLoginIdHelp, setShowLoginIdHelp] = useState(false);

  // Identity from lookup (for step 2 personalization)
  const [identity, setIdentity] = useState<{ displayName: string; avatarUrl: string | null; placeholder: boolean; isAdmin?: boolean } | null>(null);

  // Step 2 — Password
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Forgot password flow
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  // ===== Step 1: Look up Login ID =====
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!loginId.trim()) {
      toast.error('Please enter your Login ID.');
      return;
    }
    setLookupLoading(true);
    try {
      const res = await fetch('/api/auth/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Unable to verify Login ID');
        return;
      }
      if (data.placeholder) {
        // Login ID not found — increment attempt counter
        const newAttempts = loginIdAttempts + 1;
        setLoginIdAttempts(newAttempts);
        if (newAttempts >= 3) {
          // After 3 failed attempts, show the exact message + help options
          setShowLoginIdHelp(true);
        } else {
          toast.error(`Invalid login ID, please try again. (Attempt ${newAttempts} of 3)`);
        }
        return;
      }
      // Success — reset attempts
      setLoginIdAttempts(0);
      setShowLoginIdHelp(false);
      setIdentity({
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
        placeholder: data.placeholder,
        isAdmin: data.isAdmin,
      });
      setStep('password');
    } finally {
      setLookupLoading(false);
    }
  }

  // ===== Step 2: Submit password =====
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      toast.error('Please enter your password.');
      return;
    }
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password, remember }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login failed');
        return;
      }
      // Save the per-tab session token to sessionStorage.
      // This is what makes the session scoped to THIS tab only —
      // opening a new tab will not carry the token, forcing a fresh login.
      if (data.tabToken) {
        sessionStorage.setItem('arvest_tab_token', data.tabToken);
      }
      toast.success(`Welcome back, ${data.user.name.split(' ')[0]}`);
      // Full page reload so the new tab token is picked up cleanly
      setTimeout(() => {
        window.location.href = '/';
      }, 600);
    } finally {
      setLoginLoading(false);
    }
  }

  // ===== Forgot password: send code =====
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail || loginId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Unable to send code');
        return;
      }
      if (data.demoCode) {
        setDemoCode(data.demoCode);
        toast.success('Verification code sent (simulated email).', {
          description: `Demo code: ${data.demoCode}`,
        });
      } else {
        toast.success('If that email exists, a reset code has been sent.');
      }
      setStep('verify');
    } finally {
      setForgotLoading(false);
    }
  }

  // ===== Forgot password: verify code + reset =====
  async function handleVerifyAndReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetCode || resetCode.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail || loginId, code: resetCode, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Reset failed');
        return;
      }
      toast.success('Password reset successfully. Please sign in.');
      setPassword('');
      setResetCode('');
      setNewPassword('');
      setForgotEmail('');
      setDemoCode(null);
      setStep('loginId');
    } finally {
      setForgotLoading(false);
    }
  }

  function backToLoginId() {
    setStep('loginId');
    setIdentity(null);
    setPassword('');
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ===== Left — Brand panel (unchanged) ===== */}
      <div className="lg:w-1/2 arvest-gradient text-white p-8 lg:p-14 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0%, transparent 40%)',
        }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-11 h-11 rounded-md bg-white/10 border border-white/30 flex items-center justify-center backdrop-blur-sm">
              <span className="font-serif-display text-2xl text-white">A</span>
            </div>
            <div>
              <div className="font-serif-display text-xl tracking-wide">ARVEST</div>
              <div className="text-[10px] tracking-[0.3em] text-white/70 -mt-0.5">PRIVATE BANKING</div>
            </div>
          </div>

          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs tracking-wider mb-6">
              <Sparkles className="w-3 h-3" />
              EST. 1871 · MEMBER FDIC
            </div>
            <h1 className="font-serif-display text-4xl lg:text-5xl leading-tight mb-4">
              Banking, refined for a private clientele.
            </h1>
            <p className="text-white/80 text-sm lg:text-base leading-relaxed italic">
              Personal wealth management, concierge service, and tailored financial solutions delivered with the discretion you expect from Arvest Private.
            </p>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4 mt-12 max-w-md">
          {[
            { icon: TrendingUp, label: '$48B+', sub: 'Assets Under Mgmt' },
            { icon: Users, label: '14,000+', sub: 'Private Clients' },
            { icon: Clock, label: '24/7', sub: 'Concierge Banker' },
          ].map((s, i) => (
            <div key={i} className="border-t border-white/20 pt-3">
              <s.icon className="w-4 h-4 text-white/70 mb-2" />
              <div className="font-serif-display text-xl">{s.label}</div>
              <div className="text-[10px] text-white/60 tracking-wider">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Right — Login form ===== */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          {/* ===== Step 1: Login ID ===== */}
          {step === 'loginId' && (
            <>
              <div className="mb-8">
                <div className="text-[11px] tracking-[0.2em] text-primary font-medium mb-2">PRIVATE BANKING</div>
                <h2 className="font-serif-display text-3xl text-foreground mb-2">Sign in</h2>
                <p className="text-sm text-muted-foreground">
                  Please enter your Login ID to log in to private banking.
                </p>
              </div>

              <form onSubmit={handleLookup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="loginId">
                    Login ID <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="loginId" required autoFocus
                      className="pl-9 h-11"
                      placeholder="Enter your Login ID"
                      value={loginId}
                      onChange={(e) => { setLoginId(e.target.value); setShowLoginIdHelp(false); }}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 arvest-gradient text-white" disabled={lookupLoading}>
                  {lookupLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</>
                  ) : (
                    <>Submit <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </form>

              {/* After 3 failed attempts: show invalid Login ID message + help */}
              {showLoginIdHelp && (
                <div className="mt-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-destructive">Invalid login ID, please try again.</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        We couldn't find an account with that Login ID. After 3 failed attempts, please use the help options below to recover your access.
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 pl-6">
                    <button
                      onClick={() => { setForgotEmail(loginId); setStep('forgot'); }}
                      className="text-xs text-primary hover:underline text-left"
                    >
                      → Get help with my Login ID
                    </button>
                    <button
                      onClick={() => { setForgotEmail(loginId); setStep('forgot'); }}
                      className="text-xs text-primary hover:underline text-left"
                    >
                      → Reset my password
                    </button>
                    <button
                      onClick={() => { setLoginId(''); setShowLoginIdHelp(false); setLoginIdAttempts(0); }}
                      className="text-xs text-muted-foreground hover:text-foreground text-left"
                    >
                      → Try a different Login ID
                    </button>
                  </div>
                </div>
              )}

              {/* Need help? section */}
              <div className="mt-8 pt-6 border-t border-border">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground mb-1">Need help?</div>
                    <div className="space-y-1">
                      <button
                        onClick={() => { setForgotEmail(loginId); setStep('forgot'); }}
                        className="block text-xs text-primary hover:underline"
                      >
                        Get help with Login ID.
                      </button>
                      <button
                        onClick={() => { setForgotEmail(loginId); setStep('forgot'); }}
                        className="block text-xs text-primary hover:underline"
                      >
                        Reset password
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ===== Step 2: Password ===== */}
          {step === 'password' && (
            <>
              <button onClick={backToLoginId} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
                <ChevronLeft className="w-4 h-4" /> Use a different Login ID
              </button>

              <div className="mb-8">
                <div className="text-[11px] tracking-[0.2em] text-primary font-medium mb-2">PRIVATE BANKING</div>
                <h2 className="font-serif-display text-3xl text-foreground mb-2">Welcome back</h2>
                <p className="text-sm text-muted-foreground">Please enter your password to continue.</p>
              </div>

              {/* Identity recognition card */}
              <div className="mb-6 p-4 rounded-lg border border-border bg-muted/30 flex items-center gap-3">
                <Avatar className="w-12 h-12 ring-2 ring-primary/20">
                  {identity?.avatarUrl ? (
                    <AvatarImage src={identity.avatarUrl} />
                  ) : null}
                  <AvatarFallback className={`font-serif-display ${identity?.isAdmin ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                    {identity?.isAdmin ? <Shield className="w-5 h-5" /> : (identity?.displayName?.charAt(0) || 'A')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {identity?.displayName || 'Private Client'}
                    {identity?.isAdmin && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] tracking-wider bg-primary text-primary-foreground">
                        <Shield className="w-2.5 h-2.5" /> ADMIN
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{loginId}</div>
                </div>
                {!identity?.isAdmin && (
                  <button
                    onClick={() => { setForgotEmail(loginId); setStep('forgot'); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Reset password
                  </button>
                )}
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password" type={showPw ? 'text' : 'password'} required autoFocus
                      className="pl-9 pr-9 h-11"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="remember" type="checkbox" checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">Remember this device for 30 days</label>
                </div>
                <Button type="submit" className="w-full h-11 arvest-gradient text-white" disabled={loginLoading}>
                  {loginLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</>
                  ) : (
                    <>Sign in securely <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </form>

              <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="w-3.5 h-3.5" />
                <span>Secured with 256-bit encryption · Equal Housing Lender · Member FDIC</span>
              </div>
            </>
          )}

          {/* ===== Forgot password: enter email ===== */}
          {step === 'forgot' && (
            <>
              <button onClick={() => setStep('loginId')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
                <ChevronLeft className="w-4 h-4" /> Back to sign in
              </button>
              <div className="mb-8">
                <div className="text-[11px] tracking-[0.2em] text-primary font-medium mb-2">PASSWORD RESET</div>
                <h2 className="font-serif-display text-3xl text-foreground mb-2">Reset your password</h2>
                <p className="text-sm text-muted-foreground">Enter your Login ID and we'll send you a 6-digit verification code.</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Login ID (email)</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="forgot-email" type="email" required
                      className="pl-9 h-11"
                      placeholder="you@arvestprivate.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 arvest-gradient text-white" disabled={forgotLoading}>
                  {forgotLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending code…</> : <>Send verification code <ArrowRight className="w-4 h-4 ml-2" /></>}
                </Button>
              </form>
            </>
          )}

          {/* ===== Verify code & reset password ===== */}
          {step === 'verify' && (
            <>
              <button onClick={() => setStep('loginId')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
                <ChevronLeft className="w-4 h-4" /> Back to sign in
              </button>
              <div className="mb-8">
                <div className="text-[11px] tracking-[0.2em] text-primary font-medium mb-2">VERIFY & RESET</div>
                <h2 className="font-serif-display text-3xl text-foreground mb-2">Verify & reset</h2>
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code sent to <span className="font-medium text-foreground">{forgotEmail || loginId}</span>, then choose a new password.
                </p>
                {demoCode && (
                  <div className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><strong>Demo simulation:</strong> Your code is <code className="font-mono">{demoCode}</code></span>
                  </div>
                )}
              </div>
              <form onSubmit={handleVerifyAndReset} className="space-y-5">
                <div className="space-y-2">
                  <Label>Verification Code</Label>
                  <InputOTP maxLength={6} value={resetCode} onChange={(v) => setResetCode(v)}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-pw">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="new-pw" type={showPw ? 'text' : 'password'} required
                      className="pl-9 pr-9 h-11"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 arvest-gradient text-white" disabled={forgotLoading}>
                  {forgotLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resetting…</> : <>Reset password <ArrowRight className="w-4 h-4 ml-2" /></>}
                </Button>
              </form>
            </>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>© 2026 Arvest Private Banking</span>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-foreground">Privacy</a>
              <a href="#" className="hover:text-foreground">Security</a>
              <a href="#" className="hover:text-foreground">Terms</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
