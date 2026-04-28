'use client';
import { useActionState } from 'react';
import { approveJoinRequest, rejectJoinRequest } from '../actions';

type Request = { id: string; userId: string; user: { id: string; name: string } };
type ActionResult = { error: string } | { success: true } | null;

export function JoinRequestsPanel({ requests, matchId }: { requests: Request[]; matchId: string }) {
  if (requests.length === 0) return null;
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-yellow-800 mb-3">Solicitudes pendientes ({requests.length})</h3>
      <ul className="space-y-2">
        {requests.map((req) => <RequestRow key={req.id} request={req} matchId={matchId} />)}
      </ul>
    </div>
  );
}

function RequestRow({ request, matchId }: { request: Request; matchId: string }) {
  const [approveState, approveAction, approvePending] = useActionState<ActionResult, FormData>(approveJoinRequest, null);
  const [rejectState, rejectAction, rejectPending] = useActionState<ActionResult, FormData>(rejectJoinRequest, null);
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-700">{request.user.name}</span>
      <div className="flex gap-2">
        <form action={approveAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="matchId" value={matchId} />
          <button type="submit" disabled={approvePending || rejectPending}
            className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">Aprobar</button>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="matchId" value={matchId} />
          <button type="submit" disabled={approvePending || rejectPending}
            className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50">Rechazar</button>
        </form>
      </div>
      {approveState && 'error' in approveState && <p className="text-xs text-red-600">{approveState.error}</p>}
      {rejectState && 'error' in rejectState && <p className="text-xs text-red-600">{rejectState.error}</p>}
    </li>
  );
}
