"""
Class with methods for testing Python method chunking
"""


class Calculator:
    """Calculator class with basic arithmetic operations."""

    def __init__(self, precision: int = 2):
        """Constructor initializes the calculator.

        Args:
            precision: Number of decimal places (default: 2)
        """
        self.precision = precision
        self.history = []

    def add(self, a: float, b: float) -> float:
        """Adds two numbers.

        Args:
            a: First number
            b: Second number

        Returns:
            Sum of a and b
        """
        result = a + b
        self.history.append(f"{a} + {b} = {result}")
        return self._round_to_precision(result)

    def subtract(self, a: float, b: float) -> float:
        """Subtracts b from a.

        Args:
            a: First number
            b: Second number

        Returns:
            Difference of a and b
        """
        result = a - b
        self.history.append(f"{a} - {b} = {result}")
        return self._round_to_precision(result)

    def multiply(self, a: float, b: float) -> float:
        """Multiplies two numbers."""
        result = a * b
        return self._round_to_precision(result)

    async def fetch_calculation(self, expression: str) -> float:
        """Async method that fetches calculation result from API.

        Args:
            expression: Mathematical expression to evaluate

        Returns:
            Calculated value
        """
        import aiohttp
        async with aiohttp.ClientSession() as session:
            url = f"/api/calculate?expr={expression}"
            async with session.get(url) as response:
                data = await response.json()
                return data['value']

    def calculate_steps(self, a: float, b: float):
        """Generator method that yields calculation steps.

        Args:
            a: First number
            b: Second number

        Yields:
            Calculation step descriptions
        """
        yield f"Starting calculation: {a} + {b}"
        result = a + b
        yield f"Intermediate result: {result}"
        yield f"Final result: {self._round_to_precision(result)}"

    def _round_to_precision(self, value: float) -> float:
        """Private helper method to round to precision.

        Args:
            value: Value to round

        Returns:
            Rounded value
        """
        return round(value, self.precision)

    def get_history(self) -> list[str]:
        """Gets the calculation history.

        Returns:
            List of calculation history strings
        """
        return self.history.copy()

    def clear_history(self) -> None:
        """Clears the history."""
        self.history.clear()

    @property
    def total_calculations(self) -> int:
        """Property that returns total number of calculations.

        Returns:
            Number of calculations in history
        """
        return len(self.history)

    @total_calculations.setter
    def total_calculations(self, value: int) -> None:
        """Setter for total_calculations (not really useful, just for testing)."""
        pass  # Can't actually set this


class ScientificCalculator(Calculator):
    """Extended calculator with scientific operations.

    Inherits from Calculator and adds scientific functions.
    """

    def __init__(self):
        """Constructor with default high precision."""
        super().__init__(precision=10)

    def power(self, base: float, exponent: float) -> float:
        """Calculates power.

        Args:
            base: Base number
            exponent: Exponent

        Returns:
            base^exponent
        """
        return base ** exponent

    def sqrt(self, value: float) -> float:
        """Calculates square root.

        Args:
            value: Number to take square root of

        Returns:
            Square root of value
        """
        import math
        return math.sqrt(value)


# Multiple inheritance example
class LoggingMixin:
    """Mixin that adds logging capability."""

    def log(self, message: str) -> None:
        """Logs a message.

        Args:
            message: Message to log
        """
        print(f"[LOG] {message}")


class LoggingCalculator(Calculator, LoggingMixin):
    """Calculator with logging capability."""

    def add(self, a: float, b: float) -> float:
        """Adds two numbers with logging."""
        self.log(f"Adding {a} + {b}")
        return super().add(a, b)
