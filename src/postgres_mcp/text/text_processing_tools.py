"""Text Processing Suite for PostgreSQL MCP Server.

This module provides 9 text processing tools leveraging PostgreSQL extensions:
- text_similarity: Trigram similarity (pg_trgm)
- text_search_advanced: Full-text search with ranking
- regex_extract_all: Pattern extraction with groups
- fuzzy_match: Levenshtein distance matching
- text_phonetic: Soundex/Metaphone matching
- text_normalize: Unicode normalization
- text_tokenize: Advanced tokenization
- text_sentiment: Basic sentiment analysis
- text_language_detect: Language detection
"""

import logging
import re
from typing import Any
from typing import Dict
from typing import List
from typing import Optional

from ..sql import SafeSqlDriver
from ..sql import SqlDriver

logger = logging.getLogger(__name__)


class TextProcessingTools:
    """Text processing operations for PostgreSQL."""

    def __init__(self, sql_driver: SqlDriver):
        """Initialize text processing tools.

        Args:
            sql_driver: SQL driver instance for database operations
        """
        self.sql_driver = sql_driver

    async def text_similarity(
        self,
        table_name: str,
        text_column: str,
        search_text: str,
        similarity_threshold: float = 0.3,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Find similar text using trigram similarity (pg_trgm extension).

        Args:
            table_name: Source table name
            text_column: Text column name
            search_text: Text to search for
            similarity_threshold: Minimum similarity score (0-1)
            limit: Maximum results to return

        Returns:
            Similar text matches with similarity scores

        Examples:
            # Find similar product names
            await text_similarity('products', 'name', 'iPhone',
                                similarity_threshold=0.4)

        Note:
            Requires pg_trgm extension: CREATE EXTENSION IF NOT EXISTS pg_trgm;
        """
        try:
            # Check if pg_trgm is installed
            check_query = """
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
            ) as has_pg_trgm
            """
            result = await self.sql_driver.execute_query(check_query)

            if not result or not result[0].cells.get("has_pg_trgm"):
                return {
                    "success": False,
                    "error": "pg_trgm extension not installed. Run: CREATE EXTENSION IF NOT EXISTS pg_trgm;",
                }

            # Query with similarity
            query = """
            SELECT 
                {},
                similarity({}, {}) as similarity_score
            FROM {}
            WHERE similarity({}, {}) > {}
            ORDER BY similarity({}, {}) DESC
            LIMIT {}
            """

            params = [
                text_column,
                text_column,
                search_text,
                table_name,
                text_column,
                search_text,
                similarity_threshold,
                text_column,
                search_text,
                limit,
            ]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "search_text": search_text,
                "threshold": similarity_threshold,
            }

        except Exception as e:
            logger.error(f"Error in text_similarity: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def text_search_advanced(
        self,
        table_name: str,
        text_columns: List[str],
        search_query: str,
        language: str = "english",
        rank_normalization: int = 0,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Advanced full-text search with ranking.

        Args:
            table_name: Source table name
            text_columns: List of text columns to search
            search_query: Search query (supports AND, OR, NOT operators)
            language: Text search language configuration
            rank_normalization: Rank normalization (0-32)
            limit: Maximum results to return

        Returns:
            Search results with relevance ranking

        Examples:
            # Search articles
            await text_search_advanced(
                'articles',
                ['title', 'content'],
                'postgresql & (json | jsonb)',
                language='english'
            )
        """
        try:
            # Build tsvector expression for multiple columns
            if len(text_columns) == 1:
                tsvector_expr = f"to_tsvector('{language}', {{}})"
                tsvector_params = [text_columns[0]]
            else:
                # Concatenate multiple columns with weights
                weighted_columns = " || ' ' || ".join([f"coalesce({{}}, '')" for _ in text_columns])
                tsvector_expr = f"to_tsvector('{language}', {weighted_columns})"
                tsvector_params = text_columns

            # Build query
            query = f"""
            SELECT 
                *,
                ts_rank_cd(
                    {tsvector_expr},
                    to_tsquery('{language}', {{}}),
                    {{}}
                ) as rank
            FROM {{}}
            WHERE {tsvector_expr} @@ to_tsquery('{language}', {{}})
            ORDER BY rank DESC
            LIMIT {{}}
            """

            params = (
                tsvector_params
                + [search_query, rank_normalization, table_name]
                + tsvector_params
                + [search_query, limit]
            )

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "search_query": search_query,
                "language": language,
            }

        except Exception as e:
            logger.error(f"Error in text_search_advanced: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def regex_extract_all(
        self,
        table_name: str,
        text_column: str,
        pattern: str,
        flags: str = "g",
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Extract all pattern matches with capture groups.

        Args:
            table_name: Source table name
            text_column: Text column name
            pattern: Regular expression pattern
            flags: Regex flags (g=global, i=case-insensitive)
            where_clause: Optional WHERE clause
            where_params: Parameters for WHERE clause
            limit: Maximum results to return

        Returns:
            All pattern matches with capture groups

        Examples:
            # Extract email addresses
            await regex_extract_all(
                'users',
                'bio',
                r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
                flags='gi'
            )

            # Extract hashtags
            await regex_extract_all(
                'posts',
                'content',
                r'#(\w+)',
                flags='g'
            )
        """
        try:
            where_part = f"WHERE {where_clause}" if where_clause else ""

            # Use regexp_matches to extract all matches
            query = f"""
            SELECT 
                id,
                {{}},
                regexp_matches({{}}, {{}}, {{}}) as matches
            FROM {{}}
            {where_part}
            LIMIT {{}}
            """

            params = [text_column, text_column, pattern, flags, table_name] + (where_params or []) + [limit]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "pattern": pattern,
            }

        except Exception as e:
            logger.error(f"Error in regex_extract_all: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def fuzzy_match(
        self,
        table_name: str,
        text_column: str,
        search_text: str,
        max_distance: int = 3,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Find fuzzy matches using Levenshtein distance.

        Args:
            table_name: Source table name
            text_column: Text column name
            search_text: Text to search for
            max_distance: Maximum edit distance
            limit: Maximum results to return

        Returns:
            Fuzzy matches with edit distances

        Examples:
            # Find misspelled names
            await fuzzy_match('users', 'name', 'Jon Smith', max_distance=2)

        Note:
            Requires fuzzystrmatch extension: CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
        """
        try:
            # Check if fuzzystrmatch is installed
            check_query = """
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = 'fuzzystrmatch'
            ) as has_fuzzystrmatch
            """
            result = await self.sql_driver.execute_query(check_query)

            if not result or not result[0].cells.get("has_fuzzystrmatch"):
                return {
                    "success": False,
                    "error": "fuzzystrmatch extension not installed. Run: CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;",
                }

            # Query with Levenshtein distance
            query = """
            SELECT 
                {},
                levenshtein({}, {}) as edit_distance
            FROM {}
            WHERE levenshtein({}, {}) <= {}
            ORDER BY levenshtein({}, {}) ASC
            LIMIT {}
            """

            params = [
                text_column,
                text_column,
                search_text,
                table_name,
                text_column,
                search_text,
                max_distance,
                text_column,
                search_text,
                limit,
            ]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "search_text": search_text,
                "max_distance": max_distance,
            }

        except Exception as e:
            logger.error(f"Error in fuzzy_match: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def text_phonetic(
        self,
        table_name: str,
        text_column: str,
        search_text: str,
        algorithm: str = "soundex",
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Find phonetically similar text using Soundex or Metaphone.

        Args:
            table_name: Source table name
            text_column: Text column name
            search_text: Text to search for
            algorithm: Phonetic algorithm ('soundex', 'metaphone', 'dmetaphone')
            limit: Maximum results to return

        Returns:
            Phonetically similar matches

        Examples:
            # Find similar sounding names
            await text_phonetic('users', 'last_name', 'Smith', algorithm='soundex')

        Note:
            Requires fuzzystrmatch extension: CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
        """
        try:
            # Check if fuzzystrmatch is installed
            check_query = """
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = 'fuzzystrmatch'
            ) as has_fuzzystrmatch
            """
            result = await self.sql_driver.execute_query(check_query)

            if not result or not result[0].cells.get("has_fuzzystrmatch"):
                return {
                    "success": False,
                    "error": "fuzzystrmatch extension not installed. Run: CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;",
                }

            # Choose algorithm
            if algorithm.lower() == "soundex":
                phonetic_func = "soundex"
            elif algorithm.lower() == "metaphone":
                phonetic_func = "metaphone"
            elif algorithm.lower() == "dmetaphone":
                phonetic_func = "dmetaphone"
            else:
                return {
                    "success": False,
                    "error": f"Invalid algorithm: {algorithm}. Use 'soundex', 'metaphone', or 'dmetaphone'.",
                }

            # Query with phonetic matching
            query = f"""
            SELECT 
                {{}},
                {phonetic_func}({{}}) as phonetic_code,
                {phonetic_func}({{}}) as search_code
            FROM {{}}
            WHERE {phonetic_func}({{}}) = {phonetic_func}({{}})
            LIMIT {{}}
            """

            params = [
                text_column,
                text_column,
                search_text,
                table_name,
                text_column,
                search_text,
                limit,
            ]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "search_text": search_text,
                "algorithm": algorithm,
            }

        except Exception as e:
            logger.error(f"Error in text_phonetic: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def text_normalize(
        self,
        text: str,
        normalization: str = "NFC",
    ) -> Dict[str, Any]:
        """Normalize Unicode text.

        Args:
            text: Text to normalize
            normalization: Normalization form ('NFC', 'NFD', 'NFKC', 'NFKD')

        Returns:
            Normalized text

        Examples:
            # Normalize accented characters
            await text_normalize('café', 'NFC')

            # Decompose characters
            await text_normalize('café', 'NFD')
        """
        try:
            # PostgreSQL has normalize() function
            query = """
            SELECT normalize({}, {}) as normalized_text
            """

            params = [text, normalization]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {
                    "success": False,
                    "error": "Normalization failed",
                }

            normalized = result[0].cells.get("normalized_text", text)

            return {
                "success": True,
                "original": text,
                "normalized": normalized,
                "form": normalization,
            }

        except Exception as e:
            logger.error(f"Error in text_normalize: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def text_tokenize(
        self,
        text: str,
        language: str = "english",
    ) -> Dict[str, Any]:
        """Tokenize text using PostgreSQL's text search tokenizer.

        Args:
            text: Text to tokenize
            language: Language configuration for tokenization

        Returns:
            List of tokens with positions

        Examples:
            # Tokenize English text
            await text_tokenize('The quick brown fox', 'english')
        """
        try:
            # Use ts_debug to get detailed tokenization
            query = """
            SELECT 
                token,
                tokid,
                token_type,
                dictionary,
                lexemes
            FROM ts_debug({}, {})
            """

            params = [language, text]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "tokens": [], "count": 0}

            tokens = [row.cells for row in result]

            return {
                "success": True,
                "tokens": tokens,
                "count": len(tokens),
                "language": language,
            }

        except Exception as e:
            logger.error(f"Error in text_tokenize: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def text_sentiment(
        self,
        text: str,
    ) -> Dict[str, Any]:
        """Basic sentiment analysis using keyword matching.

        Args:
            text: Text to analyze

        Returns:
            Sentiment score and classification

        Examples:
            # Analyze sentiment
            await text_sentiment('I love this product! It is amazing!')

        Note:
            This is a simple keyword-based sentiment analysis.
            For production, consider using dedicated ML models.
        """
        try:
            # Simple sentiment analysis using keyword matching
            positive_words = [
                "good",
                "great",
                "excellent",
                "amazing",
                "wonderful",
                "fantastic",
                "love",
                "best",
                "awesome",
                "perfect",
            ]
            negative_words = [
                "bad",
                "terrible",
                "awful",
                "horrible",
                "hate",
                "worst",
                "poor",
                "disappointing",
                "useless",
                "pathetic",
            ]

            # Normalize text
            text_lower = text.lower()

            # Count positive and negative words
            positive_count = sum(1 for word in positive_words if word in text_lower)
            negative_count = sum(1 for word in negative_words if word in text_lower)

            # Calculate sentiment score (-1 to 1)
            total_words = len(text.split())
            if total_words == 0:
                sentiment_score = 0.0
            else:
                sentiment_score = (positive_count - negative_count) / max(total_words, 1)

            # Classify sentiment
            if sentiment_score > 0.1:
                classification = "positive"
            elif sentiment_score < -0.1:
                classification = "negative"
            else:
                classification = "neutral"

            return {
                "success": True,
                "text": text,
                "sentiment_score": sentiment_score,
                "classification": classification,
                "positive_words": positive_count,
                "negative_words": negative_count,
            }

        except Exception as e:
            logger.error(f"Error in text_sentiment: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def text_language_detect(
        self,
        text: str,
    ) -> Dict[str, Any]:
        """Detect language of text using character patterns.

        Args:
            text: Text to analyze

        Returns:
            Detected language with confidence

        Examples:
            # Detect language
            await text_language_detect('Hello world')

        Note:
            This is a basic implementation using character patterns.
            For production, consider using dedicated language detection libraries.
        """
        try:
            # Simple language detection based on character ranges
            # This is a basic implementation - production should use proper libraries

            text_clean = text.strip()
            if not text_clean:
                return {
                    "success": True,
                    "language": "unknown",
                    "confidence": 0.0,
                }

            # Count characters by script
            latin_count = sum(1 for c in text_clean if ord(c) < 0x0250)
            cyrillic_count = sum(1 for c in text_clean if 0x0400 <= ord(c) <= 0x04FF)
            arabic_count = sum(1 for c in text_clean if 0x0600 <= ord(c) <= 0x06FF)
            chinese_count = sum(1 for c in text_clean if 0x4E00 <= ord(c) <= 0x9FFF)

            total_chars = len(text_clean)
            if total_chars == 0:
                return {
                    "success": True,
                    "language": "unknown",
                    "confidence": 0.0,
                }

            # Calculate percentages
            scripts = {
                "latin": latin_count / total_chars,
                "cyrillic": cyrillic_count / total_chars,
                "arabic": arabic_count / total_chars,
                "chinese": chinese_count / total_chars,
            }

            # Find dominant script
            dominant_script = max(scripts.items(), key=lambda x: x[1])

            return {
                "success": True,
                "language": dominant_script[0],
                "confidence": dominant_script[1],
                "scripts": scripts,
            }

        except Exception as e:
            logger.error(f"Error in text_language_detect: {e}")
            return {
                "success": False,
                "error": str(e),
            }

