import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest, NetworkError } from './api';
import type { Room } from './roomTypes';

// ============================================================
// 离线写队列（outbox）
// 断网时把"改房间"操作排队，联网后自动重放。
// 房间更新是幂等的（PUT 完整状态），重放安全。
// ============================================================

const OUTBOX_KEY = 'house_outbox';

interface OutboxItem {
  kind: 'updateRoom';
  roomId: string;
  room: Room;      // 完整房间状态（幂等重放）
  ts: number;
}

async function readOutbox(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

// 入队一个房间更新（同一房间只保留最新一条，避免堆积）
export async function enqueueRoomUpdate(room: Room): Promise<void> {
  const items = await readOutbox();
  const filtered = items.filter((i) => i.roomId !== room.id);
  filtered.push({ kind: 'updateRoom', roomId: room.id, room, ts: Date.now() });
  await writeOutbox(filtered);
}

export async function getPendingCount(): Promise<number> {
  return (await readOutbox()).length;
}

// 重放队列。返回成功同步的条数。遇到网络错误则停止（保留剩余）。
export async function flushOutbox(): Promise<{ synced: number; remaining: number }> {
  const items = await readOutbox();
  if (items.length === 0) return { synced: 0, remaining: 0 };

  let synced = 0;
  const remaining: OutboxItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      await apiRequest(`/rooms/${item.roomId}`, { method: 'PUT', body: item.room });
      synced++;
    } catch (e) {
      if (e instanceof NetworkError) {
        // 还是断网，剩下的全部保留，停止重放
        remaining.push(...items.slice(i));
        break;
      }
      // 业务错误（如房间已被删）：丢弃这条，继续
    }
  }

  await writeOutbox(remaining);
  return { synced, remaining: remaining.length };
}
