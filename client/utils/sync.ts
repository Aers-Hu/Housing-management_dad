import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { apiRequest, NetworkError } from './api';
import type { Room } from './roomTypes';

// ============================================================
// 离线写队列（outbox）
// 断网时把"改房间"操作排队，联网后自动重放。
// 房间更新是幂等的（PUT 完整状态），重放安全。
//
// 注意：重放属于"离线期间的改动"，会带上 X-Offline-Replay 标记，
// 服务端据此把改动转入"待审表"，由主库 owner 在电脑端逐条批准后才落库
// （而非静默覆盖）。在线实时改动不经过本队列，照旧直接生效。
// ============================================================

const OUTBOX_KEY = 'house_outbox';

// 设备型号（如 "iPhone 15 Pro" / "Redmi K60"），随重放上报，便于 owner 判断改动来源是否可信。
// 编码以兼容非 ASCII 机型名（HTTP 头只接受 Latin-1）。
function deviceModelHeader(): string {
  const model = Device.modelName || Device.deviceName || '未知设备';
  try { return encodeURIComponent(model); } catch { return 'unknown'; }
}

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

// 重放队列。返回同步结果。遇到网络错误则停止（保留剩余）。
// 重放走 X-Offline-Replay：服务端不直接落库，而是返回 202 { pending: true } 进待审表。
// 因此这里统计「已提交待确认」的条数与受影响楼房，供调用方据此「以主库为准」回收缓存。
export async function flushOutbox(): Promise<{
  synced: number;
  remaining: number;
  submittedForReview: number;
  affectedBuildingIds: string[];
}> {
  const items = await readOutbox();
  if (items.length === 0) {
    return { synced: 0, remaining: 0, submittedForReview: 0, affectedBuildingIds: [] };
  }

  let synced = 0;
  let submittedForReview = 0;
  const affected = new Set<string>();
  const remaining: OutboxItem[] = [];
  const replayHeaders = {
    'X-Offline-Replay': '1',
    'X-Client-Type': 'mobile',
    'X-Device-Model': deviceModelHeader(),
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const resp = await apiRequest<{ pending?: boolean }>(
        `/rooms/${item.roomId}`,
        { method: 'PUT', body: item.room, headers: replayHeaders },
      );
      synced++;
      // 服务端返回 pending=true 表示这条进了待审表（未落主库）
      if (resp && resp.pending) {
        submittedForReview++;
        if (item.room.buildingId) affected.add(item.room.buildingId);
      }
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
  return {
    synced,
    remaining: remaining.length,
    submittedForReview,
    affectedBuildingIds: Array.from(affected),
  };
}
