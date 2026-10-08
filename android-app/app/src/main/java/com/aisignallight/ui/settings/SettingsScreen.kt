package com.aisignallight.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.aisignallight.R
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.ThemeMode

private val SettingsProvider.displayName: String
    get() = when (this) {
        SettingsProvider.KIMI -> "Kimi"
        SettingsProvider.MINIMAX -> "MiniMax"
        SettingsProvider.COPILOT -> "Copilot"
        SettingsProvider.DEEPSEEK -> "DeepSeek"
        SettingsProvider.VOLCENGINE -> "火山引擎"
    }

private fun AppConfig.isEnabled(provider: SettingsProvider): Boolean = when (provider) {
    SettingsProvider.KIMI -> kimi.enabled
    SettingsProvider.MINIMAX -> minimax.enabled
    SettingsProvider.COPILOT -> copilot.enabled
    SettingsProvider.DEEPSEEK -> deepseek.enabled
    SettingsProvider.VOLCENGINE -> volcengine.enabled
}

private fun AppConfig.tokenValue(provider: SettingsProvider): String = when (provider) {
    SettingsProvider.KIMI -> kimi.token
    SettingsProvider.MINIMAX -> minimax.token
    SettingsProvider.COPILOT -> copilot.token
    SettingsProvider.DEEPSEEK -> deepseek.token
    SettingsProvider.VOLCENGINE -> volcengine.cookie
}

private fun AppConfig.useProxyValue(provider: SettingsProvider): Boolean = when (provider) {
    SettingsProvider.KIMI -> kimi.useProxy
    SettingsProvider.MINIMAX -> minimax.useProxy
    SettingsProvider.COPILOT -> copilot.useProxy
    SettingsProvider.DEEPSEEK -> deepseek.useProxy
    SettingsProvider.VOLCENGINE -> volcengine.useProxy
}

/** 火山引擎需要 Cookie + x-csrf-token 两个字段才算配置完成 */
private fun AppConfig.isConfigured(provider: SettingsProvider): Boolean = when (provider) {
    SettingsProvider.VOLCENGINE -> volcengine.cookie.isNotBlank() && volcengine.csrfToken.isNotBlank()
    else -> tokenValue(provider).isNotBlank()
}

@Composable
private fun themeLabel(mode: ThemeMode): String = when (mode) {
    ThemeMode.LIGHT -> stringResource(R.string.settings_theme_light)
    ThemeMode.DARK -> stringResource(R.string.settings_theme_dark)
    ThemeMode.SYSTEM -> stringResource(R.string.settings_theme_system)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val config by viewModel.config.collectAsStateWithLifecycle()

    var showThemeDialog by remember { mutableStateOf(false) }
    var showIntervalDialog by remember { mutableStateOf(false) }
    var showWarnDialog by remember { mutableStateOf(false) }
    var showDangerDialog by remember { mutableStateOf(false) }
    var showProxyDialog by remember { mutableStateOf(false) }
    var editingProvider by remember { mutableStateOf<SettingsProvider?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.settings_back)
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            item { SectionTitle(stringResource(R.string.settings_group_general)) }

            item {
                SettingsRow(
                    title = stringResource(R.string.settings_theme),
                    subtitle = themeLabel(config.themeMode),
                    onClick = { showThemeDialog = true }
                )
            }
            item {
                SettingsRow(
                    title = stringResource(R.string.settings_interval),
                    subtitle = stringResource(R.string.settings_interval_value, config.intervalMinutes),
                    onClick = { showIntervalDialog = true }
                )
            }
            item {
                SettingsRow(
                    title = stringResource(R.string.settings_warn),
                    subtitle = stringResource(R.string.settings_threshold_value, config.thresholds.warn),
                    onClick = { showWarnDialog = true }
                )
            }
            item {
                SettingsRow(
                    title = stringResource(R.string.settings_danger),
                    subtitle = stringResource(R.string.settings_threshold_value, config.thresholds.danger),
                    onClick = { showDangerDialog = true }
                )
            }
            item {
                SettingsRow(
                    title = stringResource(R.string.settings_proxy),
                    subtitle = config.proxy.url.ifBlank { stringResource(R.string.settings_proxy_none) },
                    onClick = { showProxyDialog = true }
                )
            }

            item { SectionTitle(stringResource(R.string.settings_group_providers)) }

            items(SettingsProvider.entries, key = { it.name }) { provider ->
                SettingsProviderRow(
                    provider = provider,
                    config = config,
                    onToggle = { enabled -> viewModel.updateProviderEnabled(provider, enabled) },
                    onClick = { editingProvider = provider }
                )
            }
        }
    }

    if (showThemeDialog) {
        ThemeDialog(
            selected = config.themeMode,
            onSelect = { mode ->
                viewModel.updateTheme(mode)
                showThemeDialog = false
            },
            onDismiss = { showThemeDialog = false }
        )
    }

    if (showIntervalDialog) {
        ChoiceDialog(
            title = stringResource(R.string.settings_interval),
            options = SettingsViewModel.VALID_INTERVALS,
            selected = config.intervalMinutes,
            optionLabel = { stringResource(R.string.settings_interval_value, it) },
            onSelect = { minutes ->
                viewModel.updateInterval(minutes)
                showIntervalDialog = false
            },
            onDismiss = { showIntervalDialog = false }
        )
    }

    if (showWarnDialog) {
        ThresholdDialog(
            title = stringResource(R.string.settings_warn),
            initialValue = config.thresholds.warn,
            crossFieldValid = { it < config.thresholds.danger },
            onConfirm = { value ->
                viewModel.updateThresholds(warn = value, danger = config.thresholds.danger)
                showWarnDialog = false
            },
            onDismiss = { showWarnDialog = false }
        )
    }

    if (showDangerDialog) {
        ThresholdDialog(
            title = stringResource(R.string.settings_danger),
            initialValue = config.thresholds.danger,
            crossFieldValid = { it > config.thresholds.warn },
            onConfirm = { value ->
                viewModel.updateThresholds(warn = config.thresholds.warn, danger = value)
                showDangerDialog = false
            },
            onDismiss = { showDangerDialog = false }
        )
    }

    if (showProxyDialog) {
        ProxyDialog(
            initialUrl = config.proxy.url,
            onConfirm = { url ->
                viewModel.updateProxy(url)
                showProxyDialog = false
            },
            onDismiss = { showProxyDialog = false }
        )
    }

    editingProvider?.let { provider ->
        val isVolcengine = provider == SettingsProvider.VOLCENGINE
        ProviderDialog(
            title = provider.displayName,
            tokenLabel = stringResource(
                if (isVolcengine) R.string.settings_cookie_label else R.string.settings_token_label
            ),
            showCsrfField = isVolcengine,
            initialToken = config.tokenValue(provider),
            initialCsrfToken = config.volcengine.csrfToken,
            initialUseProxy = config.useProxyValue(provider),
            helpText = if (isVolcengine) stringResource(R.string.settings_volcengine_help) else null,
            onConfirm = { token, csrfToken, useProxy ->
                if (isVolcengine) {
                    viewModel.updateVolcengineConfig(token, csrfToken, useProxy)
                } else {
                    viewModel.updateProviderToken(provider, token, useProxy)
                }
                editingProvider = null
            },
            onDismiss = { editingProvider = null }
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsRow(
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(subtitle) },
        modifier = Modifier.clickable(onClick = onClick)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsProviderRow(
    provider: SettingsProvider,
    config: AppConfig,
    onToggle: (Boolean) -> Unit,
    onClick: () -> Unit
) {
    val status = when {
        !config.isEnabled(provider) -> stringResource(R.string.settings_provider_disabled)
        !config.isConfigured(provider) -> stringResource(R.string.settings_provider_no_token)
        else -> stringResource(R.string.settings_provider_enabled)
    }

    ListItem(
        headlineContent = { Text(provider.displayName) },
        supportingContent = { Text(status) },
        trailingContent = {
            Switch(checked = config.isEnabled(provider), onCheckedChange = onToggle)
        },
        modifier = Modifier.clickable(onClick = onClick)
    )
}

/** 单选对话框：点选项即生效并关闭，仅保留"取消"按钮 */
@Composable
private fun ThemeDialog(
    selected: ThemeMode,
    onSelect: (ThemeMode) -> Unit,
    onDismiss: () -> Unit
) {
    val options = listOf(ThemeMode.LIGHT, ThemeMode.DARK, ThemeMode.SYSTEM)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_theme)) },
        text = {
            Column {
                options.forEach { mode ->
                    SelectableRow(
                        label = themeLabel(mode),
                        selected = selected == mode,
                        onClick = { onSelect(mode) }
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        }
    )
}

@Composable
private fun ChoiceDialog(
    title: String,
    options: List<Int>,
    selected: Int,
    optionLabel: @Composable (Int) -> String,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                options.forEach { value ->
                    SelectableRow(
                        label = optionLabel(value),
                        selected = selected == value,
                        onClick = { onSelect(value) }
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        }
    )
}

@Composable
private fun SelectableRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = null)
        Spacer(modifier = Modifier.width(8.dp))
        Text(text = label, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun ThresholdDialog(
    title: String,
    initialValue: Int,
    crossFieldValid: (Int) -> Boolean,
    onConfirm: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    var text by remember { mutableStateOf(initialValue.toString()) }

    val parsed = text.toIntOrNull()
    val value = parsed ?: -1
    val rangeError = parsed == null || value !in SettingsViewModel.THRESHOLD_RANGE
    val crossError = !rangeError && !crossFieldValid(value)
    val errorText = when {
        rangeError -> stringResource(R.string.settings_threshold_range)
        crossError -> stringResource(R.string.settings_threshold_invalid)
        else -> null
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = text,
                    onValueChange = { input -> text = input.filter { it.isDigit() }.take(3) },
                    label = { Text(title) },
                    singleLine = true,
                    isError = errorText != null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                errorText?.let {
                    Text(
                        text = it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(value) },
                enabled = errorText == null
            ) {
                Text(stringResource(R.string.confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        }
    )
}

@Composable
private fun ProxyDialog(
    initialUrl: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var text by remember { mutableStateOf(initialUrl) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_proxy)) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                placeholder = { Text(stringResource(R.string.settings_proxy_hint)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(text) }) { Text(stringResource(R.string.confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        }
    )
}

@Composable
private fun ProviderDialog(
    title: String,
    tokenLabel: String,
    showCsrfField: Boolean,
    initialToken: String,
    initialCsrfToken: String,
    initialUseProxy: Boolean,
    helpText: String?,
    onConfirm: (token: String, csrfToken: String, useProxy: Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    var token by remember { mutableStateOf(initialToken) }
    var csrfToken by remember { mutableStateOf(initialCsrfToken) }
    var useProxy by remember { mutableStateOf(initialUseProxy) }
    var tokenVisible by remember { mutableStateOf(false) }
    var csrfVisible by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                SecretField(
                    value = token,
                    onValueChange = { token = it },
                    label = tokenLabel,
                    visible = tokenVisible,
                    onToggleVisible = { tokenVisible = !tokenVisible }
                )

                if (showCsrfField) {
                    Spacer(modifier = Modifier.height(8.dp))
                    SecretField(
                        value = csrfToken,
                        onValueChange = { csrfToken = it },
                        label = stringResource(R.string.settings_csrf_label),
                        visible = csrfVisible,
                        onToggleVisible = { csrfVisible = !csrfVisible }
                    )
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = useProxy, onCheckedChange = { useProxy = it })
                    Text(
                        text = stringResource(R.string.settings_use_proxy),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                helpText?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(token, csrfToken, useProxy) }) {
                Text(stringResource(R.string.confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        }
    )
}

@Composable
private fun SecretField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    visible: Boolean,
    onToggleVisible: () -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        trailingIcon = {
            TextButton(onClick = onToggleVisible) {
                Text(
                    stringResource(
                        if (visible) R.string.settings_hide_secret else R.string.settings_show_secret
                    )
                )
            }
        },
        modifier = Modifier.fillMaxWidth()
    )
}
