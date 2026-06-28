package com.aisignallight.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import com.aisignallight.domain.model.ProviderConfig
import com.aisignallight.domain.model.ThemeMode
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ThemeSelector(
    selected: ThemeMode,
    onSelect: (ThemeMode) -> Unit
) {
    val options = listOf(ThemeMode.LIGHT, ThemeMode.DARK, ThemeMode.SYSTEM)
    val labels = mapOf(
        ThemeMode.LIGHT to "浅色",
        ThemeMode.DARK to "深色",
        ThemeMode.SYSTEM to "跟随系统"
    )

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = "主题", style = MaterialTheme.typography.titleMedium)
        SingleChoiceSegmentedButtonRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
        ) {
            options.forEachIndexed { index, mode ->
                SegmentedButton(
                    selected = selected == mode,
                    onClick = { onSelect(mode) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size)
                ) {
                    Text(labels[mode] ?: mode.name)
                }
            }
        }
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var savedMessage by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("设置") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            ThemeSelector(
                selected = uiState.themeMode,
                onSelect = { viewModel.updateTheme(it) }
            )

            ProviderSection(
                title = "Kimi",
                config = uiState.kimi,
                onChange = { viewModel.updateKimi(it) }
            )

            ProviderSection(
                title = "MiniMax",
                config = uiState.minimax,
                onChange = { viewModel.updateMinimax(it) }
            )

            ProviderSection(
                title = "Copilot (Cookie)",
                config = uiState.copilot,
                onChange = { viewModel.updateCopilot(it) }
            )

            OutlinedTextField(
                value = uiState.proxyUrl,
                onValueChange = { viewModel.updateProxy(it) },
                label = { Text("代理地址 (可选)") },
                placeholder = { Text("http://127.0.0.1:7890") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
            )

            OutlinedTextField(
                value = uiState.intervalMinutes.toString(),
                onValueChange = {
                    it.toIntOrNull()?.let { min -> viewModel.updateInterval(min) }
                },
                label = { Text("轮询间隔（分钟）") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = uiState.warnThreshold.toString(),
                    onValueChange = {
                        it.toIntOrNull()?.let { v -> viewModel.updateThresholds(v, uiState.dangerThreshold) }
                    },
                    label = { Text("Warn %") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                OutlinedTextField(
                    value = uiState.dangerThreshold.toString(),
                    onValueChange = {
                        it.toIntOrNull()?.let { v -> viewModel.updateThresholds(uiState.warnThreshold, v) }
                    },
                    label = { Text("Danger %") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
            }

            if (uiState.warnThreshold >= uiState.dangerThreshold) {
                Text(
                    text = "Warn 阈值必须小于 Danger 阈值",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelMedium
                )
            }

            savedMessage?.let {
                Text(text = it, color = MaterialTheme.colorScheme.primary)
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = { navController.navigate("scan") },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("扫码导入桌面配置")
            }

            Button(
                onClick = {
                    scope.launch {
                        val ok = viewModel.save()
                        savedMessage = if (ok) "已保存" else "保存失败：阈值或间隔不合法"
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = uiState.warnThreshold < uiState.dangerThreshold
            ) {
                Text("保存")
            }
        }
    }
}

@Composable
private fun ProviderSection(
    title: String,
    config: ProviderConfig,
    onChange: (ProviderConfig) -> Unit
) {
    var showToken by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(text = title, style = MaterialTheme.typography.titleMedium)

        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = config.enabled,
                onCheckedChange = { onChange(config.copy(enabled = it)) }
            )
            Text("启用", style = MaterialTheme.typography.bodyMedium)
        }

        OutlinedTextField(
            value = config.token,
            onValueChange = { onChange(config.copy(token = it)) },
            label = { Text("Token / Cookie") },
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = config.useProxy,
                onCheckedChange = { onChange(config.copy(useProxy = it)) }
            )
            Text("使用全局代理", style = MaterialTheme.typography.bodyMedium)
        }
    }
}
