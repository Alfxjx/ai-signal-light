## KIMI

```

curl --location 'https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages' \
--header 'authorization: Bearer eyxxxx' \
--header 'Content-Type: application/json' \
--data '{"scope":["FEATURE_CODING"]}'


{
    "usages": [
        {
            "scope": "FEATURE_CODING",
            "detail": {
                "limit": "100",
                "used": "29",
                "remaining": "71",
                "resetTime": "2026-06-11T00:50:13.855166Z"
            },
            "limits": [
                {
                    "window": {
                        "duration": 300,
                        "timeUnit": "TIME_UNIT_MINUTE"
                    },
                    "detail": {
                        "limit": "100",
                        "used": "10",
                        "remaining": "90",
                        "resetTime": "2026-06-10T03:50:13.855166Z"
                    }
                }
            ]
        }
    ],
    "totalQuota": {
        "limit": "100",
        "used": "34",
        "remaining": "66"
    }
}

```

kimi 有两个用量，总额度totalQuota，还有kimi code 额度，其中kimi code 还分成了 window 和 total 两个维度，window 是一个滚动窗口，duration 是 300 分钟的用量，detail里是一周的。


## MINIMAX

``` 
curl --location 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains' \
--header 'Authorization: Bearer sk-cp-xxx' \
--header 'Content-Type: application/json'

{
    "model_remains": [
        {
            "start_time": 1781056800000,
            "end_time": 1781074800000,
            "remains_time": 15243209,
            "current_interval_total_count": 0,
            "current_interval_usage_count": 0,
            "model_name": "general",
            "current_weekly_total_count": 0,
            "current_weekly_usage_count": 0,
            "weekly_start_time": 1780848000000,
            "weekly_end_time": 1781452800000,
            "weekly_remains_time": 393243209,
            "current_interval_status": 1,
            "current_interval_remaining_percent": 100,
            "current_weekly_status": 1,
            "current_weekly_remaining_percent": 87,
            "weekly_boost_permille": 1500
        },
        {
            "start_time": 1781020800000,
            "end_time": 1781107200000,
            "remains_time": 47643209,
            "current_interval_total_count": 0,
            "current_interval_usage_count": 0,
            "model_name": "video",
            "current_weekly_total_count": 0,
            "current_weekly_usage_count": 0,
            "weekly_start_time": 1780848000000,
            "weekly_end_time": 1781452800000,
            "weekly_remains_time": 393243209,
            "current_interval_status": 3,
            "current_interval_remaining_percent": 100,
            "current_weekly_status": 3,
            "current_weekly_remaining_percent": 100
        }
    ],
    "base_resp": {
        "status_code": 0,
        "status_msg": "success"
    }
}

```

minimax  的主要看 "model_name": "general", 这个的，current_interval_remaining_percent是5小时的，current_weekly_remaining_percent 这个是一周的，weekly_boost_permille 这个暂时没啥太大用，可以不管。