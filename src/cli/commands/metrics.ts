/**
 * Metrics command - View collected performance metrics
 *
 * @module commands/metrics
 */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

interface PerformanceLogEntry {
  level: 'INFO' | 'WARN';
  timestamp: string;
  query: string;
  metrics: {
    lexicalSearchTimeMs: number;
    vectorSearchTimeMs: number;
    rankingTimeMs: number;
    totalTimeMs: number;
    lexicalCandidates: number;
    vectorCandidates: number;
    uniqueCandidates: number;
    slaViolation: boolean;
    fallbackMode: string | null;
  };
}

interface AggregateStats {
  totalQueries: number;
  avgTotalTime: number;
  avgLexicalTime: number;
  avgVectorTime: number;
  avgRankingTime: number;
  p50: number;
  p95: number;
  p99: number;
  slaViolationCount: number;
  slaViolationRate: number;
  fallbackModeCount: number;
  lexicalOnlyCount: number;
  vectorOnlyCount: number;
  hybridCount: number;
}

/**
 * Calculate percentile from sorted values
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)] ?? 0;
}

/**
 * Parse JSON lines log file
 */
function parseLogFile(logPath: string): PerformanceLogEntry[] {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.trim().split('\n').filter(line => line.length > 0);

  const entries: PerformanceLogEntry[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as PerformanceLogEntry;
      entries.push(entry);
    } catch (error) {
      // Skip malformed lines
      console.error(`Skipping malformed log line: ${line.substring(0, 50)}...`);
    }
  }

  return entries;
}

/**
 * Calculate aggregate statistics from log entries
 */
function calculateAggregateStats(entries: PerformanceLogEntry[]): AggregateStats {
  if (entries.length === 0) {
    return {
      totalQueries: 0,
      avgTotalTime: 0,
      avgLexicalTime: 0,
      avgVectorTime: 0,
      avgRankingTime: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      slaViolationCount: 0,
      slaViolationRate: 0,
      fallbackModeCount: 0,
      lexicalOnlyCount: 0,
      vectorOnlyCount: 0,
      hybridCount: 0,
    };
  }

  const totalTimes = entries.map(e => e.metrics.totalTimeMs).sort((a, b) => a - b);
  const totalQueries = entries.length;

  const sumLexical = entries.reduce((sum, e) => sum + e.metrics.lexicalSearchTimeMs, 0);
  const sumVector = entries.reduce((sum, e) => sum + e.metrics.vectorSearchTimeMs, 0);
  const sumRanking = entries.reduce((sum, e) => sum + e.metrics.rankingTimeMs, 0);
  const sumTotal = entries.reduce((sum, e) => sum + e.metrics.totalTimeMs, 0);

  const slaViolationCount = entries.filter(e => e.metrics.slaViolation).length;
  const fallbackModeCount = entries.filter(e => e.metrics.fallbackMode !== null).length;

  const lexicalOnlyCount = entries.filter(
    e => e.metrics.fallbackMode === 'lexical'
  ).length;
  const vectorOnlyCount = entries.filter(
    e => e.metrics.fallbackMode === 'vector'
  ).length;
  const hybridCount = entries.filter(e => e.metrics.fallbackMode === null).length;

  return {
    totalQueries,
    avgTotalTime: sumTotal / totalQueries,
    avgLexicalTime: sumLexical / totalQueries,
    avgVectorTime: sumVector / totalQueries,
    avgRankingTime: sumRanking / totalQueries,
    p50: percentile(totalTimes, 50),
    p95: percentile(totalTimes, 95),
    p99: percentile(totalTimes, 99),
    slaViolationCount,
    slaViolationRate: (slaViolationCount / totalQueries) * 100,
    fallbackModeCount,
    lexicalOnlyCount,
    vectorOnlyCount,
    hybridCount,
  };
}

/**
 * Format statistics as human-readable output
 */
function formatStats(stats: AggregateStats): string {
  const lines: string[] = [];

  lines.push(chalk.bold('\n📊 Search Performance Metrics\n'));

  lines.push(chalk.bold('Query Statistics:'));
  lines.push(`  Total Queries:        ${stats.totalQueries}`);
  lines.push(`  Hybrid Mode:          ${stats.hybridCount} (${((stats.hybridCount / stats.totalQueries) * 100).toFixed(1)}%)`);
  lines.push(`  Lexical Only:         ${stats.lexicalOnlyCount} (${((stats.lexicalOnlyCount / stats.totalQueries) * 100).toFixed(1)}%)`);
  lines.push(`  Vector Only:          ${stats.vectorOnlyCount} (${((stats.vectorOnlyCount / stats.totalQueries) * 100).toFixed(1)}%)`);
  lines.push('');

  lines.push(chalk.bold('Timing Statistics (ms):'));
  lines.push(`  Average Total:        ${stats.avgTotalTime.toFixed(2)}ms`);
  lines.push(`  Average Lexical:      ${stats.avgLexicalTime.toFixed(2)}ms`);
  lines.push(`  Average Vector:       ${stats.avgVectorTime.toFixed(2)}ms`);
  lines.push(`  Average Ranking:      ${stats.avgRankingTime.toFixed(2)}ms`);
  lines.push('');

  lines.push(chalk.bold('Latency Percentiles:'));
  lines.push(`  P50 (Median):         ${stats.p50.toFixed(2)}ms`);
  lines.push(`  P95:                  ${stats.p95.toFixed(2)}ms`);
  lines.push(`  P99:                  ${stats.p99.toFixed(2)}ms`);
  lines.push('');

  lines.push(chalk.bold('SLA Compliance:'));
  const slaStatus = stats.p95 < 300
    ? chalk.green('✓ PASSING')
    : chalk.red('✗ FAILING');
  lines.push(`  Target:               <300ms p95`);
  lines.push(`  Actual:               ${stats.p95.toFixed(2)}ms p95 ${slaStatus}`);
  lines.push(`  Violations:           ${stats.slaViolationCount} / ${stats.totalQueries} (${stats.slaViolationRate.toFixed(1)}%)`);
  lines.push('');

  if (stats.fallbackModeCount > 0) {
    lines.push(chalk.yellow('⚠️  Fallback Mode Usage:'));
    lines.push(`  Total Fallbacks:      ${stats.fallbackModeCount} (${((stats.fallbackModeCount / stats.totalQueries) * 100).toFixed(1)}%)`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Metrics command handler
 */
async function handleMetrics(options: { json?: boolean; logDir?: string }) {
  const logDir = options.logDir || '.codeindex/logs';
  const logPath = path.join(logDir, 'search-performance.jsonl');

  // Check if log file exists
  if (!fs.existsSync(logPath)) {
    console.log(chalk.yellow('⚠️  No performance metrics found.'));
    console.log(chalk.dim(`Expected log file at: ${logPath}`));
    console.log(chalk.dim('\nRun some hybrid searches to collect metrics.'));
    process.exit(0);
  }

  // Parse log file
  const entries = parseLogFile(logPath);

  if (entries.length === 0) {
    console.log(chalk.yellow('⚠️  No valid metrics found in log file.'));
    process.exit(0);
  }

  // Calculate statistics
  const stats = calculateAggregateStats(entries);

  // Output
  if (options.json) {
    // JSON format
    console.log(JSON.stringify(stats, null, 2));
  } else {
    // Human-readable format
    console.log(formatStats(stats));
  }
}

/**
 * Create metrics command
 */
export function createMetricsCommand(): Command {
  const command = new Command('metrics');

  command
    .description('View collected search performance metrics')
    .option('--json', 'Output metrics in JSON format')
    .option('--log-dir <path>', 'Path to logs directory (default: .codeindex/logs)')
    .action(handleMetrics);

  return command;
}
