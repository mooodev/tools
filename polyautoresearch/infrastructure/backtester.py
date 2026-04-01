"""
Backtesting engine for YES-side prediction market trading.

Simulates trading within 15m blocks:
- Buy YES at the ask price
- Sell YES at the bid price
- Open positions at end of block have value = 0 (total loss)

READ-ONLY: Do not modify this file. Only train.py is editable.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Trade:
    """A single completed or expired trade."""
    buy_tick: int
    buy_price: float      # bought at ask
    buy_time: float       # epoch
    sell_tick: Optional[int] = None
    sell_price: float = 0.0    # sold at bid, or 0 if expired
    sell_time: Optional[float] = None
    expired: bool = False      # True if position was open at end of block
    pnl: float = 0.0


@dataclass
class BlockResult:
    """Trading results for a single 15m block."""
    block_index: int
    filepath: str
    trades: list[Trade] = field(default_factory=list)
    total_pnl: float = 0.0
    n_buys: int = 0
    n_sells: int = 0
    n_expired: int = 0
    win_rate: float = 0.0
    max_drawdown: float = 0.0


@dataclass
class Position:
    """An open position."""
    buy_tick: int
    buy_price: float
    buy_time: float


def run_backtest(
    yes_series: list[dict],
    signals: list[dict],
    block_index: int = 0,
    filepath: str = "",
    max_positions: int = 1,
) -> BlockResult:
    """
    Run backtest on a single 15m block.

    Args:
        yes_series: YES-side orderbook entries sorted by time.
        signals: List of signal dicts, one per tick in yes_series.
            Each signal dict should have:
              - "action": "buy", "sell", or "hold"
        block_index: Index of this block.
        filepath: Path to source file.
        max_positions: Max concurrent open positions.

    Returns:
        BlockResult with all trades and summary stats.
    """
    result = BlockResult(block_index=block_index, filepath=filepath)
    open_positions: list[Position] = []
    trades: list[Trade] = []

    for tick_idx, (entry, signal) in enumerate(zip(yes_series, signals)):
        action = signal.get("action", "hold")

        # Handle sell signals first
        if action == "sell" and open_positions:
            pos = open_positions.pop(0)  # FIFO
            sell_price = entry["topBid"]
            pnl = sell_price - pos.buy_price
            trades.append(Trade(
                buy_tick=pos.buy_tick,
                buy_price=pos.buy_price,
                buy_time=pos.buy_time,
                sell_tick=tick_idx,
                sell_price=sell_price,
                sell_time=entry["epoch"],
                expired=False,
                pnl=pnl,
            ))

        # Handle buy signals
        elif action == "buy" and len(open_positions) < max_positions:
            buy_price = entry["topAsk"]
            open_positions.append(Position(
                buy_tick=tick_idx,
                buy_price=buy_price,
                buy_time=entry["epoch"],
            ))

    # Expire all remaining open positions at 0
    for pos in open_positions:
        pnl = 0.0 - pos.buy_price  # value = 0, loss = buy_price
        trades.append(Trade(
            buy_tick=pos.buy_tick,
            buy_price=pos.buy_price,
            buy_time=pos.buy_time,
            sell_tick=None,
            sell_price=0.0,
            sell_time=None,
            expired=True,
            pnl=pnl,
        ))

    # Compute stats
    result.trades = trades
    result.total_pnl = sum(t.pnl for t in trades)
    result.n_buys = len(trades)
    result.n_sells = sum(1 for t in trades if not t.expired)
    result.n_expired = sum(1 for t in trades if t.expired)

    closed_trades = [t for t in trades if not t.expired]
    if closed_trades:
        result.win_rate = sum(1 for t in closed_trades if t.pnl > 0) / len(closed_trades)

    # Max drawdown
    cumulative = 0.0
    peak = 0.0
    max_dd = 0.0
    for t in trades:
        cumulative += t.pnl
        peak = max(peak, cumulative)
        dd = peak - cumulative
        max_dd = max(max_dd, dd)
    result.max_drawdown = max_dd

    return result


def aggregate_results(block_results: list[BlockResult]) -> dict:
    """Compute aggregate stats across all blocks."""
    if not block_results:
        return {"total_pnl": 0.0, "n_blocks": 0}

    total_pnl = sum(r.total_pnl for r in block_results)
    total_trades = sum(r.n_buys for r in block_results)
    total_expired = sum(r.n_expired for r in block_results)
    total_sells = sum(r.n_sells for r in block_results)

    all_closed = []
    for r in block_results:
        all_closed.extend([t for t in r.trades if not t.expired])

    win_rate = 0.0
    avg_win = 0.0
    avg_loss = 0.0
    if all_closed:
        winners = [t for t in all_closed if t.pnl > 0]
        losers = [t for t in all_closed if t.pnl <= 0]
        win_rate = len(winners) / len(all_closed)
        if winners:
            avg_win = sum(t.pnl for t in winners) / len(winners)
        if losers:
            avg_loss = sum(t.pnl for t in losers) / len(losers)

    profitable_blocks = sum(1 for r in block_results if r.total_pnl > 0)

    return {
        "total_pnl": total_pnl,
        "avg_pnl_per_block": total_pnl / len(block_results),
        "n_blocks": len(block_results),
        "profitable_blocks": profitable_blocks,
        "profitable_block_pct": profitable_blocks / len(block_results),
        "total_trades": total_trades,
        "total_sells": total_sells,
        "total_expired": total_expired,
        "expire_rate": total_expired / total_trades if total_trades > 0 else 0.0,
        "win_rate": win_rate,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "max_drawdown": max(r.max_drawdown for r in block_results) if block_results else 0.0,
    }
