/**
 * Output formatting utilities for CLI
 */

/**
 * Output format types
 */
export enum OutputFormat {
  HUMAN = 'human',
  JSON = 'json'
}

/**
 * Output colors for terminal
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

/**
 * Symbols for terminal output
 */
const symbols = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  arrow: '→',
  bullet: '•',
  spinner: '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
};

/**
 * Output formatter class
 */
export class OutputFormatter {
  private format: OutputFormat;
  private useColor: boolean;

  constructor(format: OutputFormat = OutputFormat.HUMAN, useColor: boolean = true) {
    this.format = format;
    this.useColor = useColor && process.stdout.isTTY;
  }

  /**
   * Outputs success message
   */
  success(message: string, data?: any): void {
    if (this.format === OutputFormat.JSON) {
      this.json({ status: 'success', message, ...data });
    } else {
      const symbol = this.colorize(symbols.success, 'green');
      console.log(`${symbol} ${message}`);
      if (data) {
        this.details(data);
      }
    }
  }

  /**
   * Outputs error message
   */
  error(message: string, error?: Error | any): void {
    if (this.format === OutputFormat.JSON) {
      this.json({
        status: 'error',
        message,
        error: error ? {
          name: error.name || 'Error',
          message: error.message || String(error),
          stack: error.stack
        } : undefined
      });
    } else {
      const symbol = this.colorize(symbols.error, 'red');
      console.error(`${symbol} ${this.colorize(message, 'red')}`);
      if (error && error.message) {
        console.error(`  ${this.colorize(error.message, 'dim')}`);
      }
    }
  }

  /**
   * Outputs warning message
   */
  warning(message: string, details?: any): void {
    if (this.format === OutputFormat.JSON) {
      this.json({ status: 'warning', message, ...details });
    } else {
      const symbol = this.colorize(symbols.warning, 'yellow');
      console.warn(`${symbol} ${this.colorize(message, 'yellow')}`);
      if (details) {
        this.details(details);
      }
    }
  }

  /**
   * Outputs info message
   */
  info(message: string, details?: any): void {
    if (this.format === OutputFormat.JSON) {
      this.json({ status: 'info', message, ...details });
    } else {
      const symbol = this.colorize(symbols.info, 'blue');
      console.log(`${symbol} ${message}`);
      if (details) {
        this.details(details);
      }
    }
  }

  /**
   * Outputs progress update
   */
  progress(current: number, total: number, message?: string): void {
    if (this.format === OutputFormat.JSON) {
      this.json({
        type: 'progress',
        current,
        total,
        percent: Math.round((current / total) * 100),
        message
      });
    } else {
      const percent = Math.round((current / total) * 100);
      const barLength = 30;
      const filled = Math.round(barLength * (current / total));
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

      process.stdout.write('\r');
      process.stdout.write(
        `${this.colorize(bar, 'cyan')} ${percent}% ` +
        `(${current}/${total}) ${message || ''}`
      );

      if (current === total) {
        process.stdout.write('\n');
      }
    }
  }

  /**
   * Outputs a table
   */
  table(headers: string[], rows: any[][]): void {
    if (this.format === OutputFormat.JSON) {
      const data = rows.map(row => {
        const obj: any = {};
        headers.forEach((header, i) => {
          obj[header] = row[i];
        });
        return obj;
      });
      this.json({ type: 'table', headers, data });
    } else {
      // Calculate column widths
      const widths = headers.map((h, i) => {
        const values = [h, ...rows.map(r => String(r[i] || ''))];
        return Math.max(...values.map(v => v.length));
      });

      // Print header
      const headerRow = headers.map((h, i) => h.padEnd(widths[i] || 0)).join(' │ ');
      console.log(this.colorize(headerRow, 'bright'));

      // Print separator
      const separator = widths.map(w => '─'.repeat(w)).join('─┼─');
      console.log(this.colorize(separator, 'dim'));

      // Print rows
      for (const row of rows) {
        const rowStr = row.map((cell, i) =>
          String(cell || '').padEnd(widths[i] || 0)
        ).join(' │ ');
        console.log(rowStr);
      }
    }
  }

  /**
   * Outputs a list
   */
  list(items: string[], ordered: boolean = false): void {
    if (this.format === OutputFormat.JSON) {
      this.json({ type: 'list', items, ordered });
    } else {
      items.forEach((item, i) => {
        const prefix = ordered ? `${i + 1}.` : symbols.bullet;
        console.log(`  ${this.colorize(prefix, 'dim')} ${item}`);
      });
    }
  }

  /**
   * Outputs search results
   */
  searchResults(results: Array<{
    path: string;
    line: number;
    column: number;
    text: string;
    context: string;
  }>): void {
    if (this.format === OutputFormat.JSON) {
      this.json({ type: 'search_results', results });
    } else {
      for (const result of results) {
        // File path and location
        const location = `${result.path}:${result.line}:${result.column}`;
        console.log(this.colorize(location, 'cyan'));

        // Context with match highlighted
        const context = result.context
          .replace(result.text, this.colorize(result.text, 'yellow', 'bright'));
        console.log(`  ${context}`);
        console.log(); // Empty line between results
      }
    }
  }

  /**
   * Outputs file tree
   */
  tree(items: Array<{ path: string; level: number; isLast: boolean[] }>): void {
    if (this.format === OutputFormat.JSON) {
      this.json({ type: 'tree', items });
    } else {
      for (const item of items) {
        let prefix = '';
        for (let i = 0; i < item.level; i++) {
          if (i === item.level - 1) {
            prefix += item.isLast[i] ? '└── ' : '├── ';
          } else {
            prefix += item.isLast[i] ? '    ' : '│   ';
          }
        }
        console.log(this.colorize(prefix, 'dim') + item.path);
      }
    }
  }

  /**
   * Outputs raw JSON
   */
  json(data: any): void {
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Outputs details (key-value pairs)
   */
  private details(data: Record<string, any>): void {
    for (const [key, value] of Object.entries(data)) {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      console.log(`  ${this.colorize(formattedKey + ':', 'dim')} ${value}`);
    }
  }

  /**
   * Colorizes text
   */
  private colorize(text: string, ...colorNames: string[]): string {
    if (!this.useColor) return text;

    let result = text;
    for (const colorName of colorNames) {
      const color = (colors as any)[colorName];
      if (color) {
        result = color + result;
      }
    }
    return result + colors.reset;
  }

  /**
   * Creates a spinner
   */
  spinner(message: string): { start: () => void; stop: () => void; update: (msg: string) => void } {
    let interval: NodeJS.Timeout | null = null;
    let frame = 0;

    return {
      start: () => {
        if (this.format === OutputFormat.JSON) {
          this.json({ type: 'spinner', status: 'start', message });
          return;
        }

        if (!this.useColor) {
          console.log(message);
          return;
        }

        interval = setInterval(() => {
          const spinnerChar = symbols.spinner.charAt(frame % symbols.spinner.length);
          process.stdout.write(`\r${this.colorize(spinnerChar, 'cyan')} ${message}`);
          frame++;
        }, 80);
      },
      stop: () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
          process.stdout.write('\r' + ' '.repeat(message.length + 4) + '\r');
        }
        if (this.format === OutputFormat.JSON) {
          this.json({ type: 'spinner', status: 'stop' });
        }
      },
      update: (msg: string) => {
        message = msg;
        if (this.format === OutputFormat.JSON) {
          this.json({ type: 'spinner', status: 'update', message });
        }
      }
    };
  }

  /**
   * Sets output format
   */
  setFormat(format: OutputFormat): void {
    this.format = format;
  }

  /**
   * Gets output format
   */
  getFormat(): OutputFormat {
    return this.format;
  }
}

/**
 * Default output formatter instance
 */
export const output = new OutputFormatter();