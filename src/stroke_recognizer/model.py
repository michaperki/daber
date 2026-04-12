from __future__ import annotations

import math
from typing import Optional

import torch
import torch.nn as nn


class AttentionPool(nn.Module):
    def __init__(self, d_model: int, d_attn: int = 128):
        super().__init__()
        self.attn = nn.Sequential(
            nn.Linear(d_model, d_attn), nn.Tanh(), nn.Linear(d_attn, 1)
        )

    def forward(self, x: torch.Tensor, mask: Optional[torch.Tensor] = None) -> torch.Tensor:
        # x: (B, T, D)
        scores = self.attn(x).squeeze(-1)  # (B, T)
        if mask is not None:
            scores = scores.masked_fill(~mask.bool(), float("-inf"))
        w = torch.softmax(scores, dim=-1)  # (B, T)
        pooled = torch.bmm(w.unsqueeze(1), x).squeeze(1)  # (B, D)
        return pooled


class StrokeConvBiGRU(nn.Module):
    def __init__(
        self,
        in_channels: int = 9,
        conv_channels: int = 64,
        conv_layers: int = 2,
        conv_kernel: int = 5,
        rnn_hidden: int = 128,
        num_classes: int = 27,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        layers = []
        c_in = in_channels
        for _ in range(conv_layers):
            layers += [
                nn.Conv1d(c_in, conv_channels, kernel_size=conv_kernel, padding=conv_kernel // 2),
                nn.BatchNorm1d(conv_channels),
                nn.ReLU(inplace=True),
                nn.Dropout(dropout),
            ]
            c_in = conv_channels
        self.conv = nn.Sequential(*layers)
        self.rnn = nn.GRU(
            input_size=conv_channels, hidden_size=rnn_hidden, num_layers=1, batch_first=True, bidirectional=True
        )
        self.pool = AttentionPool(d_model=rnn_hidden * 2, d_attn=128)
        self.head = nn.Sequential(
            nn.Linear(rnn_hidden * 2, 128), nn.ReLU(inplace=True), nn.Dropout(dropout), nn.Linear(128, num_classes)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, C)
        x = x.transpose(1, 2)  # (B, C, T)
        x = self.conv(x)
        x = x.transpose(1, 2)  # (B, T, C)
        x, _ = self.rnn(x)
        x = self.pool(x)
        logits = self.head(x)
        return logits

