/**
 * Sample TypeScript file for testing parser
 * Contains various symbol types for extraction
 */

// Type alias
type UserId = string;

// Interface
interface User {
  id: UserId;
  name: string;
  email: string;
}

// Enum
enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

// Constant
const MAX_USERS = 100;

// Class with methods and properties
export class UserManager {
  private users: User[] = [];
  private static instance: UserManager;

  constructor() {
    // Constructor
  }

  /**
   * Add a new user
   * @param user - User to add
   * @returns true if successful
   */
  public async addUser(user: User): Promise<boolean> {
    if (this.users.length >= MAX_USERS) {
      return false;
    }
    this.users.push(user);
    return true;
  }

  // Static method
  public static getInstance(): UserManager {
    if (!UserManager.instance) {
      UserManager.instance = new UserManager();
    }
    return UserManager.instance;
  }

  // Getter
  get count(): number {
    return this.users.length;
  }
}

// Function
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Arrow function
const formatUser = (user: User): string => {
  return `${user.name} <${user.email}>`;
};

// Nested function
function processUsers(users: User[]): void {
  function filterActive(user: User): boolean {
    return user.email !== '';
  }

  const active = users.filter(filterActive);
  console.log(`Active users: ${active.length}`);
}

// Export default
export default UserManager;
