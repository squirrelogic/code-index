/**
 * Sample TSX file for testing parser
 * Contains React components and JSX
 */

import React, { useState, useEffect } from 'react';
import { User } from './sample';

interface UserCardProps {
  user: User;
  onSelect?: (user: User) => void;
}

/**
 * User card component
 */
export const UserCard: React.FC<UserCardProps> = ({ user, onSelect }) => {
  const handleClick = () => {
    onSelect?.(user);
  };

  return (
    <div className="user-card" onClick={handleClick}>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
};

export function UserList({ users }: { users: User[] }) {
  const [selected, setSelected] = useState<User | null>(null);

  useEffect(() => {
    console.log('Users updated:', users.length);
  }, [users]);

  return (
    <div className="user-list">
      {users.map(user => (
        <UserCard
          key={user.id}
          user={user}
          onSelect={setSelected}
        />
      ))}
    </div>
  );
}

export default UserList;
