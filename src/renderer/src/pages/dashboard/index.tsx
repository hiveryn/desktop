import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function DashboardPage(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: () => window.hiveryn.user.getProfile(),
  });

  const name = data?.data.name ?? '';
  const initials = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <Avatar size="lg" className="size-16 text-xl">
        <AvatarFallback>{isLoading ? '…' : initials}</AvatarFallback>
      </Avatar>
      {isLoading ? (
        <p className="text-muted-foreground text-lg">Loading…</p>
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {name}</h1>
      )}
      <p className="text-muted-foreground text-sm">Welcome to Hiveryn</p>
    </div>
  );
}
