'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { AddressAutocomplete } from '@/components/banking/address-autocomplete';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { useAuth, formatCurrency, formatDate } from '@/lib/store';
import {
  User, Mail, Phone, MapPin, Lock, Bell, Eye, Shield, Loader2,
  Smartphone, CreditCard, CheckCircle2, Calendar, Moon, Sun, Fingerprint,
  TrendingUp, Wallet, ArrowLeftRight, Briefcase, ChevronRight,
} from 'lucide-react';

interface Account {
  id: string; type: string; nickname: string; accountNumber: string;
  routingNumber: string; balance: number; status: string; createdAt: string;
}

export function CustomerProfile({ onSuccess }: { onSuccess: () => void }) {
  const user = useAuth((s) => s.user);
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loginId, setLoginId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // Transfers / limits
  const [dailyLimit, setDailyLimit] = useState('50000');
  const [wireLimit, setWireLimit] = useState('250000');
  const [externalAccounts, setExternalAccounts] = useState([
    { id: '1', bank: 'Chase', nickname: 'Chase Checking', last4: '4521', verified: true },
    { id: '2', bank: 'Fidelity', nickname: 'Fidelity Brokerage', last4: '8830', verified: true },
  ]);

  // Wealth preferences
  const [riskTolerance, setRiskTolerance] = useState('MODERATE');
  const [investorStatus, setInvestorStatus] = useState('ACCREDITED');
  const [privateBanker, setPrivateBanker] = useState('Catherine Holloway');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        if (data.user) {
          setName(data.user.name || '');
          setEmail(data.user.email || '');
          setLoginId(data.user.loginId || '');
          setPhone(data.user.phone || '');
          setAddress(data.user.address || '');
          setAvatarUrl(data.user.avatarUrl || '');
        }
        const aRes = await fetch('/api/accounts');
        const aData = await aRes.json();
        setAccounts(aData.accounts || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, loginId, phone, address }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to save');
        return;
      }
      toast.success('Profile updated');
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to change password');
        return;
      }
      toast.success('Password changed successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-display text-2xl mb-1">Profile & Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your personal information, security, transfers, wealth, and appearance.</p>
      </div>

      {/* Profile header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
            <Avatar className="w-20 h-20 ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
              <AvatarImage src={avatarUrl} key={avatarUrl} />
              <AvatarFallback className="font-serif-display text-2xl bg-primary/10 text-primary">
                {name?.charAt(0) || 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-serif-display text-2xl">{name}</h2>
                <Badge className="text-[10px] bg-primary/10 text-primary hover:bg-primary/15">
                  <Shield className="w-3 h-3 mr-1" /> Private Client
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">{email}</div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>Member since {formatDate(user?.createdAt || new Date())}</span>
                <span>·</span>
                <span>{accounts.length} account{accounts.length === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>Total: {formatCurrency(totalBalance)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="profile">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="profile"><User className="w-3.5 h-3.5 mr-1.5" /> Profile</TabsTrigger>
          <TabsTrigger value="security"><Lock className="w-3.5 h-3.5 mr-1.5" /> Security</TabsTrigger>
          <TabsTrigger value="transfers"><ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" /> Transfers</TabsTrigger>
          <TabsTrigger value="wealth"><Briefcase className="w-3.5 h-3.5 mr-1.5" /> Wealth</TabsTrigger>
          <TabsTrigger value="appearance"><Moon className="w-3.5 h-3.5 mr-1.5" /> Appearance</TabsTrigger>
        </TabsList>

        {/* Profile tab */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Personal Information</CardTitle>
              <CardDescription className="text-xs">Update your name, contact info, and address on file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email (read-only)</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9 bg-muted/50" value={email} disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Login ID (for signing in)</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="your unique login id" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">This is what you use to sign in. Change it anytime — your email stays the same.</p>
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (xxx) xxx-xxxx" />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Mailing address</Label>
                  <AddressAutocomplete
                    value={address}
                    onChange={setAddress}
                    onAddressSelect={(addr) => setAddress(addr.street)}
                    placeholder="Start typing your address…"
                  />
                </div>
              </div>
              <Separator />
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={saving} className="arvest-gradient text-white">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security tab */}
        <TabsContent value="security" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription className="text-xs">Use a strong password with at least 8 characters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current password</Label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>New password</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Confirm new password</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
              </div>
              <Separator />
              <div className="flex justify-end">
                <Button onClick={changePassword} disabled={saving || !currentPassword || !newPassword} className="arvest-gradient text-white">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  Update password
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Security Settings</CardTitle>
              <CardDescription className="text-xs">Two-factor authentication, biometrics, and trusted devices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-emerald-50 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Multi-factor authentication (MFA)</div>
                    <div className="text-[11px] text-muted-foreground">Require a one-time code at every sign-in</div>
                  </div>
                </div>
                <Switch checked={mfaEnabled} onCheckedChange={setMfaEnabled} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Fingerprint className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Biometric sign-in</div>
                    <div className="text-[11px] text-muted-foreground">Use Face ID / Touch ID on supported devices</div>
                  </div>
                </div>
                <Switch checked={biometricEnabled} onCheckedChange={setBiometricEnabled} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Trusted devices</div>
                    <div className="text-[11px] text-muted-foreground">2 devices currently trusted</div>
                  </div>
                </div>
                <Button variant="outline" size="sm">Manage</Button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Last password change</div>
                    <div className="text-[11px] text-muted-foreground">During account setup</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">—</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transfers tab */}
        <TabsContent value="transfers" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Transfer Limits</CardTitle>
              <CardDescription className="text-xs">Daily and wire transfer limits for your accounts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Daily transfer limit ($)</Label>
                  <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Wire transfer limit ($)</Label>
                  <Input type="number" value={wireLimit} onChange={(e) => setWireLimit(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => toast.success('Limits updated')} className="arvest-gradient text-white">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Update limits
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">External Accounts</CardTitle>
              <CardDescription className="text-xs">Linked external accounts for transfers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {externalAccounts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-md border border-border">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.nickname}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{a.bank} · ••••{a.last4}</div>
                  </div>
                  <Badge variant={a.verified ? 'default' : 'secondary'} className="text-[10px]">
                    {a.verified ? 'Verified' : 'Pending'}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast.info('Manage external account (demo)')}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full" onClick={() => toast.info('Add external account (demo)')}>
                + Add external account
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wealth tab */}
        <TabsContent value="wealth" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Wealth Profile</CardTitle>
              <CardDescription className="text-xs">Tell us about your investing preferences. Used to tailor your wealth management experience.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Risk tolerance</Label>
                <div className="grid grid-cols-3 gap-2">
                  {['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRiskTolerance(r)}
                      className={`p-3 rounded-md border-2 text-xs font-medium capitalize transition-colors ${
                        riskTolerance === r ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted'
                      }`}
                    >
                      {r.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Investor status</Label>
                <div className="grid grid-cols-3 gap-2">
                  {['ACCREDITED', 'QUALIFIED', 'NON_QUALIFIED'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInvestorStatus(s)}
                      className={`p-3 rounded-md border-2 text-[11px] font-medium transition-colors ${
                        investorStatus === s ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted'
                      }`}
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dedicated private banker</Label>
                <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40 border border-border">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                    C
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{privateBanker}</div>
                    <div className="text-[11px] text-muted-foreground">Senior Private Banker · +1 615 659 1539</div>
                  </div>
                  <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/15">
                    <Shield className="w-2.5 h-2.5 mr-0.5" /> ASSIGNED
                  </Badge>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => toast.success('Wealth profile updated')} className="arvest-gradient text-white">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Save wealth profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance tab */}
        <TabsContent value="appearance" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription className="text-xs">Choose how Arvest Private Banking looks for you.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <button
                  onClick={() => { setTheme('light'); toast.success('Light theme'); }}
                  className={`p-5 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                    theme !== 'dark' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                  }`}
                >
                  <Sun className={`w-6 h-6 ${theme !== 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">Light</span>
                  <span className="text-[10px] text-muted-foreground">Cream + crimson</span>
                </button>
                <button
                  onClick={() => { setTheme('dark'); toast.success('Dark theme'); }}
                  className={`p-5 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                    theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                  }`}
                >
                  <Moon className={`w-6 h-6 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">Dark</span>
                  <span className="text-[10px] text-muted-foreground">Obsidian + crimson</span>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-4">
                Your preference is saved in this browser. The dark theme uses an obsidian background with muted crimson accents and subtle gold highlights for nighttime comfort.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
