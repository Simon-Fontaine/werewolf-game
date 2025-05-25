import type { Socket } from "socket.io";

export interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
  isGuest: boolean;
  gameId?: string;
}
