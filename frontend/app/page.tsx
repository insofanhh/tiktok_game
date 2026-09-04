import { GameApp } from '@/components/game/game-app';
import { GameSocketProvider } from '@/components/game/socket-provider';

export default function Home() {
  return (
    <GameSocketProvider>
      <GameApp />
    </GameSocketProvider>
  );
}
