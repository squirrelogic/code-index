"""
Sample Python file for testing parser
Contains various symbol types and patterns
"""

from typing import List, Optional
import datetime


# Constants
MAX_ITEMS = 100
DEFAULT_NAME = "Unknown"


class Item:
    """Represents an item in inventory"""

    def __init__(self, name: str, quantity: int = 0):
        """
        Initialize an item

        Args:
            name: Item name
            quantity: Initial quantity (default 0)
        """
        self.name = name
        self.quantity = quantity
        self._created_at = datetime.datetime.now()

    def add_quantity(self, amount: int) -> None:
        """Add to item quantity"""
        self.quantity += amount

    @property
    def age_days(self) -> int:
        """Get item age in days"""
        delta = datetime.datetime.now() - self._created_at
        return delta.days

    @staticmethod
    def create_default() -> 'Item':
        """Create default item"""
        return Item(DEFAULT_NAME)

    def __str__(self) -> str:
        return f"{self.name}: {self.quantity}"


class Inventory:
    """Manages collection of items"""

    def __init__(self):
        self.items: List[Item] = []

    def add_item(self, item: Item) -> bool:
        """
        Add item to inventory

        Args:
            item: Item to add

        Returns:
            True if added successfully
        """
        if len(self.items) >= MAX_ITEMS:
            return False
        self.items.append(item)
        return True

    def find_by_name(self, name: str) -> Optional[Item]:
        """Find item by name"""
        for item in self.items:
            if item.name == name:
                return item
        return None


def calculate_total_quantity(inventory: Inventory) -> int:
    """Calculate total quantity across all items"""
    total = 0

    def add_item_quantity(item: Item) -> None:
        nonlocal total
        total += item.quantity

    for item in inventory.items:
        add_item_quantity(item)

    return total


# Lambda function
get_item_name = lambda item: item.name


if __name__ == "__main__":
    inv = Inventory()
    item = Item("Widget", 10)
    inv.add_item(item)
    print(f"Total: {calculate_total_quantity(inv)}")
