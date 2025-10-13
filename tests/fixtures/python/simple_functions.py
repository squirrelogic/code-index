"""
Simple function examples for testing Python chunking
"""


def add(a: int, b: int) -> int:
    """Calculates the sum of two numbers.

    Args:
        a: First number
        b: Second number

    Returns:
        The sum of a and b
    """
    return a + b


def multiply(a: int, b: int) -> int:
    """Multiplies two numbers."""
    return a * b


def greet(name: str) -> str:
    """Greets a person by name.

    Args:
        name: Person's name

    Returns:
        Greeting message
    """
    return f"Hello, {name}!"


# Function without type hints
def legacy_function(x, y):
    """Legacy function without type hints."""
    return x + y


# Async function
async def fetch_data(url: str) -> str:
    """Fetches data from a URL.

    Args:
        url: URL to fetch from

    Returns:
        Response text
    """
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.text()


# Generator function
def number_generator(max: int):
    """Generates numbers from 0 to max.

    Args:
        max: Maximum number to generate

    Yields:
        Numbers from 0 to max-1
    """
    for i in range(max):
        yield i


# Lambda (anonymous function - should not be chunked)
square = lambda n: n * n


# Function with decorator
def decorator_example(func):
    """Example decorator function."""
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        return func(*args, **kwargs)
    return wrapper


@decorator_example
def decorated_function(x: int) -> int:
    """Function with decorator."""
    return x * 2
